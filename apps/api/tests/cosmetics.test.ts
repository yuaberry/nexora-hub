import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Cosméticos — a compra com pontos reais.
 *
 * O que estes testes travam: os pontos **saem** do livro com um motivo
 * declarado (o saldo é a soma, e uma compra é uma entrada negativa); comprar
 * duas vezes não gasta duas vezes; comprar sem saldo é recusado com o motivo;
 * e equipar o que não é teu é impossível.
 */

interface World {
  readonly app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  readonly repositories: Awaited<ReturnType<typeof buildTestApp>>['repositories'];
  readonly email: (label: string) => string;
}

async function world(): Promise<World> {
  const built = await buildTestApp();
  const stamp = Date.now();
  let counter = 0;
  return {
    ...built,
    email: (label: string) => `cosmeticos-${stamp}-${counter++}-${label}@nexora.local`,
  };
}

/** Dá pontos pelo livro, como uma conquista daria (o motivo é declarado). */
async function darPontos(w: World, userId: string, delta: number): Promise<void> {
  await w.repositories.achievements.addPoints({
    userId,
    delta,
    reason: 'achievement.first-session',
    entityId: 'first-session',
  });
}

/** O catálogo visto pelo utilizador. */
async function catalogo(w: World, token: string): Promise<{
  balance: number;
  items: { id: string; owned: boolean; equipped: boolean; cost: number; missing: number }[];
}> {
  const response = await w.app.inject({ method: 'GET', url: '/api/v1/cosmetics', headers: authHeader(token) });
  return response.json() as never;
}

async function comprar(w: World, token: string, id: string): Promise<{ ok: boolean; reason?: string; balance?: number }> {
  const response = await w.app.inject({
    method: 'POST',
    url: `/api/v1/cosmetics/${id}/buy`,
    headers: authHeader(token),
  });
  return response.json() as never;
}

describe('cosméticos', () => {
  it('exige sessão', async () => {
    const w = await world();
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/cosmetics' })).statusCode).toBe(401);
    expect(
      (await w.app.inject({ method: 'POST', url: '/api/v1/cosmetics/badge-owl/buy' })).statusCode,
    ).toBe(401);
  });

  it('sem pontos nada é teu, e o catálogo diz quanto falta', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('sem-pontos'));
    const body = await catalogo(w, member.accessToken);
    expect(body.balance).toBe(0);
    expect(body.items.every((item) => !item.owned && !item.equipped)).toBe(true);
    // O que falta é o custo inteiro — um número real, não um "em breve".
    expect(body.items.find((item) => item.id === 'badge-owl')?.missing).toBe(15);
  });

  it('comprar tira os pontos do livro e passa a ser teu', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('compra'));
    await darPontos(w, member.userId, 20);

    const antes = await catalogo(w, member.accessToken);
    expect(antes.balance).toBe(20);

    const compra = await comprar(w, member.accessToken, 'badge-owl');
    expect(compra.ok).toBe(true);
    expect(compra.balance).toBe(5);

    const depois = await catalogo(w, member.accessToken);
    expect(depois.balance).toBe(5);
    expect(depois.items.find((item) => item.id === 'badge-owl')?.owned).toBe(true);
  });

  it('comprar duas vezes não gasta duas vezes', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('duas-vezes'));
    await darPontos(w, member.userId, 40);
    expect((await comprar(w, member.accessToken, 'badge-owl')).ok).toBe(true);
    const segunda = await comprar(w, member.accessToken, 'badge-owl');
    expect(segunda.ok).toBe(false);
    expect(segunda.reason).toBe('already-owned');
    expect((await catalogo(w, member.accessToken)).balance).toBe(25);
  });

  it('sem saldo a compra é recusada com o motivo', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('sem-saldo'));
    const recusa = await comprar(w, member.accessToken, 'badge-owl');
    // Sem pontos o motivo é o saldo, não "desconhecido": o cosmético existe.
    expect(recusa.reason).toBe('insufficient-funds');
  });

  it('um cosmético que não existe não se compra', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('desconhecido'));
    await darPontos(w, member.userId, 100);
    const recusa = await comprar(w, member.accessToken, 'badge-inexistente');
    expect(recusa.reason).toBe('unknown');
  });

  it('equipar o que é teu mostra o selo; desequipar tira-o', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('equipar'));
    await darPontos(w, member.userId, 40);
    await comprar(w, member.accessToken, 'badge-owl');

    // Equipar o que não é teu é impossível.
    const alheio = await w.app.inject({
      method: 'POST',
      url: '/api/v1/cosmetics/badge-marathon/equip',
      headers: authHeader(member.accessToken),
    });
    expect(alheio.json()).toEqual({ ok: false, reason: 'already-owned' });

    const equipar = await w.app.inject({
      method: 'POST',
      url: '/api/v1/cosmetics/badge-owl/equip',
      headers: authHeader(member.accessToken),
    });
    expect(equipar.json()).toEqual({ ok: true, kind: 'badge', cosmeticId: 'badge-owl' });
    expect((await catalogo(w, member.accessToken)).items.find((item) => item.id === 'badge-owl')?.equipped).toBe(true);

    const desequipar = await w.app.inject({
      method: 'POST',
      url: '/api/v1/cosmetics/badge-owl/unequip',
      headers: authHeader(member.accessToken),
    });
    expect(desequipar.json()).toEqual({ ok: true, kind: 'badge' });
    expect((await catalogo(w, member.accessToken)).items.find((item) => item.id === 'badge-owl')?.equipped).toBe(false);
  });
});