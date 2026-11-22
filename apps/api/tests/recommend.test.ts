import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Recomendações — algoritmo declarado sobre o catálogo real.
 *
 * O que estes testes travam: os parecidos com um jogo partilham etiquetas (e
 * o próprio jogo nunca aparece), a recomendação pessoal vem da biblioteca da
 * conta ponderada pelo tempo jogado, e sem biblioteca a resposta é vazia com
 * a razão — nunca uma lista genérica a fingir conhecimento.
 */

/** App e repositórios partilhados. */
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
    email: (label: string) => `rec-${stamp}-${counter++}-${label}@nexora.local`,
  };
}

describe('GET /api/v1/recommendations/similar/:gameId', () => {
  it('não exige sessão (o directório é público)', async () => {
    const w = await world();
    const response = await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/similar/terraria' });
    expect(response.statusCode).toBe(200);
  });

  it('Terraria recomenda o que partilha etiquetas', async () => {
    const w = await world();
    const body = (await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/similar/terraria' })).json() as {
      items: { gameId: string; sharedTags: string[]; score: number }[];
    };
    expect(body.items.map((item) => item.gameId)).toContain('hollow-knight');
    // A razão da recomendação vem com ela: as etiquetas partilhadas.
    expect(body.items[0]?.sharedTags.length).toBeGreaterThan(0);
    expect(body.items[0]?.score).toBeGreaterThan(0);
  });

  it('o próprio jogo nunca aparece', async () => {
    const w = await world();
    const body = (await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/similar/hollow-knight' })).json() as {
      items: { gameId: string }[];
    };
    expect(body.items.some((item) => item.gameId === 'hollow-knight')).toBe(false);
  });

  it('um jogo fora do directório devolve 404', async () => {
    const w = await world();
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/similar/nao-existe' })).statusCode).toBe(404);
  });
});

describe('GET /api/v1/recommendations/for-you', () => {
  it('exige sessão', async () => {
    const w = await world();
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/for-you' })).statusCode).toBe(401);
  });

  it('sem biblioteca devolve vazio com a razão', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('sem-biblioteca'));
    const body = (await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/for-you', headers: authHeader(member.accessToken) })).json() as {
      items: unknown[];
      reason: string;
    };
    expect(body.items).toHaveLength(0);
    expect(body.reason).toBe('no-library');
  });

  it('as etiquetas da biblioteca mandam, ponderadas pelo tempo jogado', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('com-biblioteca'));
    // 5 h de metroidvania/plataforma e 1 h de moba.
    await w.repositories.library.upsertEntry({
      userId: member.userId,
      externalKey: 'jogos/hollow-knight',
      title: 'Hollow Knight',
      tags: ['metroidvania', 'plataforma'],
    });
    await w.repositories.library.addPlayedSeconds(member.userId, 'jogos/hollow-knight', 5 * 3600, new Date());
    await w.repositories.library.upsertEntry({
      userId: member.userId,
      externalKey: 'jogos/lol',
      title: 'League of Legends',
      tags: ['moba', 'multiplayer'],
    });
    await w.repositories.library.addPlayedSeconds(member.userId, 'jogos/lol', 3600, new Date());

    const body = (await w.app.inject({ method: 'GET', url: '/api/v1/recommendations/for-you', headers: authHeader(member.accessToken) })).json() as {
      items: { gameId: string; sharedTags: string[] }[];
      reason: string;
      preferredTags: { tag: string; weight: number }[];
    };
    // O que já tenho não me é recomendado: a recomendação é para descobrir.
    expect(body.items.some((item) => item.gameId === 'hollow-knight')).toBe(false);
    expect(body.items.some((item) => item.gameId === 'league-of-legends')).toBe(false);
    expect(body.reason).toBe('library-tags');
    // As etiquetas dos dois jogos, pesadas pelo tempo jogado: as de 5 h
    // (metroidvania e plataforma) vêm à frente das de 1 h (moba).
    expect(body.preferredTags.slice(0, 2).map((entry) => entry.tag).sort()).toEqual(['metroidvania', 'plataforma']);
    expect(body.preferredTags[0]?.weight).toBeGreaterThan(body.preferredTags[2]?.weight ?? 0);
    // E a recomendação carrega a razão — as etiquetas partilhadas.
    expect(body.items[0]?.sharedTags.length).toBeGreaterThan(0);
  });
});
