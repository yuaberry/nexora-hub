import type { FastifyInstance } from 'fastify';
import {
  COSMETICS,
  evaluatePurchase,
  equipOutcome,
  missingPoints,
} from '@nexora/core';
import { requireAuth } from '../../plugins/errorHandler.js';
import { audit } from '../../lib/audit.js';
import type { Repositories } from '../../repositories/types.js';

/**
 * Cosméticos — o que os pontos compram.
 *
 * Três regras que estas rotas impõem:
 *
 * 1. **A compra é avaliada antes de tocar no livro** — a decisão é do domínio
 *    (existe? já é teu? chega o saldo?), e a base só regista o que passou;
 * 2. **Os pontos saem do livro** com um motivo declarado (`cosmetic.<id>`):
 *    o saldo é sempre a soma das entradas, e uma compra é uma entrada
 *    negativa — não um campo que alguém possa editar à mão;
 * 3. **Só o que é teu se equipa** — equipar o que não foi comprado seria
 *    mostrar um selo que ninguém pagou.
 */
export function registerCosmeticRoutes(app: FastifyInstance, repositories: Repositories): void {
  // O catálogo com o que é teu, o que está equipado e o saldo.
  app.get('/api/v1/cosmetics', async (request) => {
    const actor = requireAuth(request);
    const [owned, equipped, balance] = await Promise.all([
      repositories.cosmetics.listOwned(actor.id),
      repositories.cosmetics.equipped(actor.id),
      repositories.achievements.balance(actor.id),
    ]);
    const ownedIds = new Set(owned.map((row) => row.cosmeticId));
    const equippedByKind = new Map(equipped.map((row) => [row.kind, row.cosmeticId]));

    return {
      balance,
      items: COSMETICS.map((cosmetic) => ({
        id: cosmetic.id,
        nameKey: cosmetic.nameKey,
        descriptionKey: cosmetic.descriptionKey,
        kind: cosmetic.kind,
        cost: cosmetic.cost,
        owned: ownedIds.has(cosmetic.id),
        equipped: equippedByKind.get(cosmetic.kind) === cosmetic.id,
        missing: missingPoints(balance, cosmetic.id),
      })),
    };
  });

  // Compra: sai do livro e passa a ser teu (as duas coisas juntas, ou nenhuma).
  app.post<{ Params: { cosmeticId: string } }>('/api/v1/cosmetics/:cosmeticId/buy', async (request) => {
    const actor = requireAuth(request);
    const cosmeticId = request.params.cosmeticId;

    const [owned, balance] = await Promise.all([
      repositories.cosmetics.listOwned(actor.id),
      repositories.achievements.balance(actor.id),
    ]);
    const decisao = evaluatePurchase({
      owned: owned.map((row) => row.cosmeticId),
      balance,
      cosmeticId,
    });
    if (!decisao.ok) {
      return { ok: false, reason: decisao.reason };
    }

    // A posse primeiro: se a compra em paralelo chegar ao mesmo tempo, a base
    // recusa a segunda (o par é único) — e os pontos não saem duas vezes.
    const gravou = await repositories.cosmetics.own(actor.id, decisao.cosmetic.id, new Date());
    if (!gravou) {
      return { ok: false, reason: 'already-owned' };
    }
    await repositories.achievements.addPoints({
      userId: actor.id,
      delta: -decisao.cosmetic.cost,
      reason: `cosmetic.${decisao.cosmetic.id}`,
      entityId: decisao.cosmetic.id,
    });
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'cosmetic.purchased',
      entity: 'cosmetic',
      entityId: decisao.cosmetic.id,
      metadata: { cost: decisao.cosmetic.cost },
      requestId: request.id,
    });

    return {
      ok: true,
      balance: balance - decisao.cosmetic.cost,
      cosmetic: { id: decisao.cosmetic.id, kind: decisao.cosmetic.kind },
    };
  });

  // Equipar um cosmético que é teu (o selo passa a aparecer ao lado do nome).
  app.post<{ Params: { cosmeticId: string } }>('/api/v1/cosmetics/:cosmeticId/equip', async (request) => {
    const actor = requireAuth(request);
    const owned = await repositories.cosmetics.listOwned(actor.id);
    const decisao = equipOutcome({
      owned: owned.map((row) => row.cosmeticId),
      cosmeticId: request.params.cosmeticId,
    });
    if (!decisao.ok) {
      return { ok: false, reason: decisao.reason };
    }
    await repositories.cosmetics.equip(actor.id, decisao.cosmetic.kind, decisao.cosmetic.id, new Date());
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'cosmetic.equipped',
      entity: 'cosmetic',
      entityId: decisao.cosmetic.id,
      requestId: request.id,
    });
    return { ok: true, kind: decisao.cosmetic.kind, cosmeticId: decisao.cosmetic.id };
  });

  // Desequipar: o nome fica sem selo até equipar outro.
  app.post<{ Params: { cosmeticId: string } }>('/api/v1/cosmetics/:cosmeticId/unequip', async (request) => {
    const actor = requireAuth(request);
    const cosmeticId = request.params.cosmeticId;
    const equipped = await repositories.cosmetics.equipped(actor.id);
    const linha = equipped.find((row) => row.cosmeticId === cosmeticId);
    if (linha === undefined) {
      return { ok: false, reason: 'not-equipped' };
    }
    await repositories.cosmetics.unequip(actor.id, linha.kind);
    await audit(repositories.audit, {
      actorId: actor.id,
      action: 'cosmetic.unequipped',
      entity: 'cosmetic',
      entityId: cosmeticId,
      requestId: request.id,
    });
    return { ok: true, kind: linha.kind };
  });
}