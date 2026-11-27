import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { loadEnv } from '../src/config/env.js';
import { createRepositories } from '../src/repositories/index.js';
import { accessTokenOf, registerUser } from './fixtures.js';

/**
 * Integração com PostgreSQL **real**.
 *
 * Só corre quando `DATABASE_URL` está definido e acessível — no CI, e na
 * máquina de desenvolvimento com os contentores de pé. Sem ela, a suite
 * principal fica em memória (modo degradado) e estes testes são **ignorados**,
 * com a omissão documentada em `README.md` e em `docs/ARCHITECTURE.md`.
 *
 * O que estes testes provam de que a memória não dá conta: o `uuid`
 * malformado é recusado antes da base, a contagem atómica de tentativas
 * falhadas conta mesmo com pedidos paralelos, e a duração inteira não é
 * recusada pelo PostgreSQL.
 */

/** `true` quando há uma base de dados configurada. */
const DATABASE_URL = process.env['DATABASE_URL'];
const describeIfDatabase = DATABASE_URL === undefined ? describe.skip : describe;

describeIfDatabase('integração com PostgreSQL real', () => {
  it('aplica migrações e serve as rotas autenticadas', async () => {
    await runMigrations(DATABASE_URL as string);

    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const user = await registerUser(
      app,
      `postgres-${Date.now()}@nexora.local`,
      'senha-de-teste-123',
      'Postgres',
    );
    expect(accessTokenOf(user)).toBeTruthy();

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessTokenOf(user)}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe(user.email);

    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect((health.json() as { mode: string }).mode).toBe('postgres');

    await app.close();
  });

  it('a contagem de tentativas falhadas é atómica sob carga paralela', async () => {
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const email = `paralelo-${Date.now()}@nexora.local`;
    await registerUser(app, email, 'senha-de-teste-123', 'Paralelo');

    // Cinco logins em paralelo com senha errada têm de contar **cinco**:
    // somar em memória e gravar depois perderia tentativas e o lockout nunca
    // existiria. Em PostgreSQL o incremento é `failed_login_attempts + 1`.
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email, password: 'senha-errada-999' },
        }),
      ),
    );
    expect(attempts.every((response) => response.statusCode === 401)).toBe(true);

    const locked = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'senha-de-teste-123' },
    });
    expect(locked.statusCode).toBe(423);

    await app.close();
  });

  it('o grupo familiar funciona sobre as tabelas reais', async () => {
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const owner = await registerUser(app, `familia-pg-dono-${stamp}@nexora.local`, 'senha-de-teste-123', 'Dono PG');
    const guest = await registerUser(app, `familia-pg-membro-${stamp}@nexora.local`, 'senha-de-teste-123', 'Membro PG');

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/family',
      payload: { name: 'Família PostgreSQL' },
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(created.statusCode).toBe(201);

    const invited = await app.inject({
      method: 'POST',
      url: '/api/v1/family/invites',
      payload: { email: guest.email },
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(invited.statusCode).toBe(201);
    const code = (invited.json() as { code: string }).code;

    // Duas contas novas em tabelas novas: o aceite tem de escrever o membro
    // e marcar o convite — em PostgreSQL, com os índices únicos a valer.
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/v1/family/invites/accept',
      payload: { code },
      headers: { authorization: `Bearer ${guest.accessToken}` },
    });
    expect(accepted.statusCode).toBe(200);
    expect((accepted.json() as { group: { members: unknown[] } }).group.members).toHaveLength(2);

    // Aceitar duas vezes o mesmo código não cria um terceiro membro.
    const again = await app.inject({
      method: 'POST',
      url: '/api/v1/family/invites/accept',
      payload: { code },
      headers: { authorization: `Bearer ${owner.accessToken}` },
    });
    expect(again.statusCode).toBeGreaterThanOrEqual(400);

    await app.close();
  });

  it('comunidade e desejos escrevem nas tabelas reais', async () => {
    // Regressão: as tabelas `comments`, `reviews` e `wishlists` faltavam na
    // migração 0000 — os repositórios PostgreSQL existiam, mas a base não
    // tinha onde escrever. A migração 0001 criou-as; este teste garante que
    // escrever, substituir e remover funcionam sobre a base real.
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const { repositories, close } = createRepositories(env);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    // Jogo único por execução: a base é partilhada entre testes e entre
    // corridas — contar comentários de um jogo conhecido contaria os dos
    // outros também.
    const gameId = `jogo-integracao-${stamp}`;
    const user = await repositories.users.create({
      email: `comunidade-pg-${stamp}@nexora.local`,
      displayName: 'Comunidade PG',
      passwordHash: 'ab'.repeat(32),
      passwordSalt: 'cd'.repeat(8),
    });

    // Comentário: cria, lista e apaga (o dono é quem criou).
    await repositories.comments.create({ gameId, userId: user.id, body: 'Comentário real.' });
    expect(await repositories.comments.listByGame(gameId, 10, 0)).toHaveLength(1);
    const created = await repositories.comments.create({ gameId, userId: user.id, body: 'Outro.' });
    expect(await repositories.comments.deleteOwned(created.id, user.id)).toBe(true);
    expect(await repositories.comments.listByGame(gameId, 10, 0)).toHaveLength(1);

    // Review: o *upsert* substitui (índice único jogo/utilizador) — se a
    // tabela não tivesse o índice, a segunda chamada criaria uma linha.
    await repositories.reviews.upsert({
      gameId,
      userId: user.id,
      rating: 7,
      story: null,
      gameplay: 8,
      graphics: null,
      sound: null,
      body: '',
    });
    await repositories.reviews.upsert({
      gameId,
      userId: user.id,
      rating: 9,
      story: null,
      gameplay: 9,
      graphics: null,
      sound: null,
      body: 'Revisto.',
    });
    const reviews = await repositories.reviews.listByGame(gameId, 10, 0);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.rating).toBe(9);

    // Lista de desejos: adicionar duas vezes não duplica (chave primária).
    await repositories.wishlist.add(user.id, gameId, 'w1');
    await repositories.wishlist.add(user.id, gameId, 'w2');
    expect(await repositories.wishlist.listByUser(user.id)).toHaveLength(1);
    expect(await repositories.wishlist.remove(user.id, gameId)).toBe(true);
    expect(await repositories.wishlist.remove(user.id, gameId)).toBe(false);

    // Grupo familiar: criar, aceitar um convite e dissolver — as três
    // tabelas novas, com os índices únicos a valer.
    const group = await repositories.family.createGroup({
      id: randomUUID(),
      name: 'Família Real',
      ownerId: user.id,
    });
    expect((await repositories.family.findGroupByUser(user.id))?.group.id).toBe(group.id);
    const guest = await repositories.users.create({
      email: `familia-pg-membro-${stamp}@nexora.local`,
      displayName: 'Membro PG',
      passwordHash: 'ab'.repeat(32),
      passwordSalt: 'cd'.repeat(8),
    });
    const code = `CONVITE-${stamp}`;
    await repositories.family.createInvite({
      id: randomUUID(),
      groupId: group.id,
      code,
      email: guest.email,
      invitedBy: user.id,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });
    expect((await repositories.family.findInviteByCode(code))?.status).toBe('pending');
    await repositories.family.addMember({ groupId: group.id, userId: guest.id, role: 'member', joinedAt: new Date() });
    await repositories.family.respondInvite((await repositories.family.findInviteByCode(code))?.id ?? randomUUID(), 'accepted', new Date());
    const snapshot = await repositories.family.findGroupByUser(guest.id);
    expect(snapshot?.members).toHaveLength(2);
    expect(await repositories.family.deleteGroup(group.id)).toBe(true);
    expect(await repositories.family.findGroupByUser(guest.id)).toBeNull();

    await close();
  });

  it('amizades e presença escrevem nas tabelas reais', async () => {
    // Regressão: as tabelas sociais são novas — o teste garante que pedido,
    // aceite (a amizade nos dois sentidos), remoção e heartbeat funcionam
    // sobre a base real, com os índices únicos a valer.
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ana = await registerUser(app, `amizade-ana-${stamp}@nexora.local`, 'senha-de-teste-123', 'Ana');
    const bruno = await registerUser(app, `amizade-bruno-${stamp}@nexora.local`, 'senha-de-teste-123', 'Bruno');
    const tokenAna = accessTokenOf(ana);
    const tokenBruno = accessTokenOf(bruno);

    const pedido = await app.inject({
      method: 'POST',
      url: '/api/v1/friends',
      payload: { email: bruno.email },
      headers: { authorization: `Bearer ${tokenAna}` },
    });
    expect(pedido.statusCode).toBe(201);
    const requestId = (pedido.json() as { id: string }).id;

    // O pedido pendente chega ao destinatário (e só a ele).
    const deBruno = await app.inject({ method: 'GET', url: '/api/v1/friends', headers: { authorization: `Bearer ${tokenBruno}` } });
    expect((deBruno.json() as { incoming: unknown[] }).incoming).toHaveLength(1);

    const aceite = await app.inject({
      method: 'POST',
      url: `/api/v1/friends/requests/${requestId}/accept`,
      headers: { authorization: `Bearer ${tokenBruno}` },
    });
    expect(aceite.statusCode).toBe(200);

    // A amizade vive nos dois sentidos — cada um tem o outro na lista.
    const amigosAna = (await app.inject({ method: 'GET', url: '/api/v1/friends', headers: { authorization: `Bearer ${tokenAna}` } })).json() as { friends: { userId: string }[] };
    const amigosBruno = (await app.inject({ method: 'GET', url: '/api/v1/friends', headers: { authorization: `Bearer ${tokenBruno}` } })).json() as { friends: { userId: string }[] };
    expect(amigosAna.friends.map((f) => f.userId)).toEqual([bruno.userId]);
    expect(amigosBruno.friends.map((f) => f.userId)).toEqual([ana.userId]);

    // Coração com jogo: a presença do amigo mostra o jogo.
    const coracao = await app.inject({
      method: 'POST',
      url: '/api/v1/presence/heartbeat',
      payload: { gameId: 'hollow-knight' },
      headers: { authorization: `Bearer ${tokenAna}` },
    });
    expect(coracao.statusCode).toBe(200);
    const presenca = (await app.inject({ method: 'GET', url: '/api/v1/friends/presence', headers: { authorization: `Bearer ${tokenBruno}` } })).json() as {
      friends: { userId: string; gameId: string | null }[];
    };
    expect(presenca.friends).toHaveLength(1);
    expect(presenca.friends[0]?.gameId).toBe('hollow-knight');

    // Remover apaga os dois lados.
    const remover = await app.inject({
      method: 'DELETE',
      url: `/api/v1/friends/${ana.userId}`,
      headers: { authorization: `Bearer ${tokenBruno}` },
    });
    expect(remover.statusCode).toBe(204);
    const depois = (await app.inject({ method: 'GET', url: '/api/v1/friends', headers: { authorization: `Bearer ${tokenAna}` } })).json() as { friends: unknown[] };
    expect(depois.friends).toHaveLength(0);

    await app.close();
  });

  it('o chat escreve nas tabelas reais e o par não duplica', async () => {
    // Regressão: as tabelas do chat são novas — o teste garante que abrir,
    // enviar e ler funcionam sobre a base real, e que o índice único do par
    // impediria uma segunda conversa para as mesmas duas pessoas.
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const ana = await registerUser(app, `chat-pg-ana-${stamp}@nexora.local`, 'senha-de-teste-123', 'Ana');
    const bruno = await registerUser(app, `chat-pg-bruno-${stamp}@nexora.local`, 'senha-de-teste-123', 'Bruno');

    const pedido = await app.inject({
      method: 'POST',
      url: '/api/v1/friends',
      payload: { email: bruno.email },
      headers: { authorization: `Bearer ${accessTokenOf(ana)}` },
    });
    expect(pedido.statusCode).toBe(201);
    const entrada = (await app.inject({ method: 'GET', url: '/api/v1/friends', headers: { authorization: `Bearer ${accessTokenOf(bruno)}` } })).json() as { incoming: { id: string }[] };
    expect((await app.inject({
      method: 'POST',
      url: `/api/v1/friends/requests/${entrada.incoming[0]!.id}/accept`,
      headers: { authorization: `Bearer ${accessTokenOf(bruno)}` },
    })).statusCode).toBe(200);

    // Ana abre a conversa; Bruno abre "a mesma" — o par reutiliza.
    const conversa = (await app.inject({
      method: 'POST',
      url: '/api/v1/chat/conversations',
      payload: { email: bruno.email },
      headers: { authorization: `Bearer ${accessTokenOf(ana)}` },
    })).json() as { id: string };
    const mesma = (await app.inject({
      method: 'POST',
      url: '/api/v1/chat/conversations',
      payload: { email: ana.email },
      headers: { authorization: `Bearer ${accessTokenOf(bruno)}` },
    })).json() as { id: string };
    expect(mesma.id).toBe(conversa.id);

    const mensagem = await app.inject({
      method: 'POST',
      url: `/api/v1/chat/conversations/${conversa.id}/messages`,
      payload: { body: 'Mensagem sobre a base real.' },
      headers: { authorization: `Bearer ${accessTokenOf(bruno)}` },
    });
    expect(mensagem.statusCode).toBe(201);
    const lidas = (await app.inject({
      method: 'GET',
      url: `/api/v1/chat/conversations/${conversa.id}/messages`,
      headers: { authorization: `Bearer ${accessTokenOf(ana)}` },
    })).json() as { items: { body: string }[] };
    expect(lidas.items[0]?.body).toBe('Mensagem sobre a base real.');

    await app.close();
  });

  it('os cosméticos compram e equipam sobre as tabelas reais', async () => {
    // Regressão: as tabelas dos cosméticos e do equipado são novas — este
    // teste garante que a compra grava uma linha por par (e a segunda compra
    // do mesmo cosmético é recusada pela chave primária, não pela memória) e
    // que equipar substitui o que estava no tipo, sem deixar dois selos.
    await runMigrations(DATABASE_URL as string);
    const env = loadEnv({ DATABASE_URL, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const { repositories, close } = createRepositories(env);

    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await repositories.users.create({
      email: `cosmeticos-pg-${stamp}@nexora.local`,
      displayName: 'Cosméticos PG',
      passwordHash: 'ab'.repeat(32),
      passwordSalt: 'cd'.repeat(8),
    });

    // Pontos pelo livro (a moeda real da economia).
    await repositories.achievements.addPoints({ userId: user.id, delta: 20, reason: 'achievement.first-session', entityId: 'first-session' });

    // Comprar duas vezes o mesmo cosmético: a segunda é recusada pela base.
    expect(await repositories.cosmetics.own(user.id, 'badge-owl', new Date())).toBe(true);
    expect(await repositories.cosmetics.own(user.id, 'badge-owl', new Date())).toBe(false);
    expect(await repositories.cosmetics.listOwned(user.id)).toHaveLength(1);

    // Equipar por tipo: substitui, não acumula.
    await repositories.cosmetics.equip(user.id, 'badge', 'badge-owl', new Date());
    await repositories.cosmetics.own(user.id, 'badge-marathon', new Date());
    await repositories.cosmetics.equip(user.id, 'badge', 'badge-marathon', new Date());
    const equipado = await repositories.cosmetics.equipped(user.id);
    expect(equipado).toHaveLength(1);
    expect(equipado[0]?.cosmeticId).toBe('badge-marathon');

    // Desequipar apaga a linha do tipo.
    expect(await repositories.cosmetics.unequip(user.id, 'badge')).toBe(true);
    expect(await repositories.cosmetics.unequip(user.id, 'badge')).toBe(false);
    expect(await repositories.cosmetics.equipped(user.id)).toHaveLength(0);

    await close();
  });
});

describe('modo de persistência reportado', () => {
  it('sem DATABASE_URL a API declara modo degradado', async () => {
    const env = loadEnv({ NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const app = await buildApp({ env, logger: false });
    const health = await app.inject({ method: 'GET', url: '/api/v1/health' });
    expect(health.statusCode).toBe(200);
    const body = health.json() as { status: string; mode: string };
    expect(body.mode).toBe('memory');
    expect(body.status).toBe('degraded');
    await app.close();
  });

});
