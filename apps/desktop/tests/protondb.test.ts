import { describe, expect, it } from 'vitest';
import { fetchProtonRating, protonReportUrl } from '../src/main/protondb.js';

/**
 * ProtonDB — consulta externa, honestidade interna.
 *
 * O `fetch` é injectado: os testes provam as três decisões (rating válido,
 * jogo sem app id, rede em baixo) sem tocar na rede — e sem *timeout* real.
 */

/** Resposta de prova da ProtonDB. */
const PROTON_RESPONSE = { tier: 'gold', confidence: 'good', score: 0.78, total: 4321 };

/** `fetch` de prova que devolve a resposta com nível. */
function okFetch(): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(PROTON_RESPONSE), { status: 200 })) as unknown as typeof fetch;
}

describe('fetchProtonRating', () => {
  it('devolve o rating com a data da consulta e a fonte', async () => {
    const result = await fetchProtonRating('730', {
      fetchImpl: okFetch(),
      now: () => new Date('2026-11-19T12:00:00.000Z'),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.rating.tier).toBe('gold');
    expect(result.rating.total).toBe(4321);
    expect(result.rating.fetchedAt).toBe('2026-11-19T12:00:00.000Z');
    expect(result.rating.sourceUrl).toBe('https://www.protondb.com/app/730');
  });

  it('recusa sem app id (não há rating a mostrar)', async () => {
    const result = await fetchProtonRating(null, { fetchImpl: okFetch() });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reasonKey).toBe('no-app-id');
  });

  it('recusa um app id não numérico', async () => {
    const result = await fetchProtonRating('abc', { fetchImpl: okFetch() });
    expect(result.ok).toBe(false);
  });

  it('recusa com 404 (sem relatórios)', async () => {
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    const result = await fetchProtonRating('999999', { fetchImpl: notFound });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reasonKey).toBe('not-found');
  });

  it('recusa quando a rede falha (sem inventar nível)', async () => {
    const broken = (async () => {
      throw new Error('rede em baixo');
    }) as unknown as typeof fetch;
    const result = await fetchProtonRating('730', { fetchImpl: broken });
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reasonKey).toBe('network');
  });

  it('recusa uma resposta sem nível reconhecido', async () => {
    const weird = (async () =>
      new Response(JSON.stringify({ tier: 'inventado' }), { status: 200 })) as unknown as typeof fetch;
    const result = await fetchProtonRating('730', { fetchImpl: weird });
    expect(result.ok).toBe(false);
  });
});

describe('protonReportUrl', () => {
  it('aponta para a página pública do jogo', () => {
    expect(protonReportUrl('730')).toBe('https://www.protondb.com/app/730');
  });
});