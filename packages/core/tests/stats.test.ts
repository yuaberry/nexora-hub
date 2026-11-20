import { describe, expect, it } from 'vitest';
import { summarizeSessions } from '../src/stats/aggregate.js';
import { limitTimeline, sortTimeline } from '../src/stats/timeline.js';
import type { SessionSample, TimelineEvent } from '../src/index.js';

/**
 * Estatísticas e timeline.
 *
 * O que estes testes travam: as contas são **reais** (10 h em 4 sessões de
 * 90 min dão 6 h), a hora de pico vem do histograma, e a timeline ordena pelo
 * mais recente com ordem estável em empates.
 */

/** Sessões de prova: 4 jogos em horas diferentes. */
const SESSIONS: readonly SessionSample[] = [
  { gameId: 'minecraft', startedAt: '2026-11-01T20:00:00.000Z', durationSeconds: 5400 },
  { gameId: 'minecraft', startedAt: '2026-11-02T21:00:00.000Z', durationSeconds: 3600 },
  { gameId: 'league-of-legends', startedAt: '2026-11-03T21:30:00.000Z', durationSeconds: 7200 },
  { gameId: 'terraria', startedAt: '2026-11-04T22:00:00.000Z', durationSeconds: 1800 },
];

const TAGS = new Map([
  ['minecraft', ['sandbox', 'sobrevivência']],
  ['league-of-legends', ['moba', 'multiplayer']],
  ['terraria', ['sandbox', 'plataforma']],
]);

describe('summarizeSessions', () => {
  it('soma horas, sessões e jogos distintos', () => {
    const summary = summarizeSessions(SESSIONS);
    // 5400 + 3600 + 7200 + 1800 = 18000 s = 5 h
    expect(summary.totalHours).toBe(5);
    expect(summary.sessionCount).toBe(4);
    expect(summary.distinctGames).toBe(3);
  });

  it('ordena o top de jogos pelo tempo', () => {
    const summary = summarizeSessions(SESSIONS);
    // minecraft: 5400 + 3600 = 9000 s = 2,5 h; league: 7200 s = 2 h.
    expect(summary.topGames[0]?.gameId).toBe('minecraft');
    expect(summary.topGames[0]?.hours).toBe(2.5);
    expect(summary.topGames[1]?.gameId).toBe('league-of-legends');
    expect(summary.topGames[1]?.hours).toBe(2);
  });

  it('o género favorito herda o tempo do jogo', () => {
    const summary = summarizeSessions(SESSIONS, TAGS);
    expect(summary.topTags[0]?.tag).toBe('sandbox');
    // minecraft (2,5 h) + terraria (0,5 h) = 3 h
    expect(summary.topTags[0]?.hours).toBe(3);
  });

  it('a hora de pico vem do histograma', () => {
    const summary = summarizeSessions(SESSIONS);
    // 21h: minecraft (21:00) + league (21:30) = 2 sessões.
    expect(summary.peakHour).toBe(21);
    expect(summary.hourHistogram[21]).toBe(2);
    expect(summary.hourHistogram[20]).toBe(1);
    expect(summary.hourHistogram[22]).toBe(1);
  });

  it('sem sessões, o resumo é zero e não inventa pico', () => {
    const summary = summarizeSessions([]);
    expect(summary.totalHours).toBe(0);
    expect(summary.sessionCount).toBe(0);
    expect(summary.peakHour).toBeNull();
    expect(summary.topGames).toHaveLength(0);
  });
});

describe('sortTimeline / limitTimeline', () => {
  const events: readonly TimelineEvent[] = [
    { id: 'a', type: 'session-ended', at: '2026-11-01T10:00:00.000Z', gameId: 'minecraft', summary: 'Jogou Minecraft' },
    { id: 'b', type: 'review-created', at: '2026-11-03T10:00:00.000Z', gameId: 'terraria', summary: 'Review de Terraria' },
    { id: 'c', type: 'wishlist-added', at: '2026-11-02T10:00:00.000Z', gameId: null, summary: 'Adicionou aos desejos' },
  ];

  it('ordena do mais recente para o mais antigo', () => {
    expect(sortTimeline(events).map((event) => event.id)).toEqual(['b', 'c', 'a']);
  });

  it('limita aos N mais recentes', () => {
    expect(limitTimeline(events, 2).map((event) => event.id)).toEqual(['b', 'c']);
  });

  it('empates são desfeitos pelo id (ordem estável)', () => {
    const tie: readonly TimelineEvent[] = [
      { id: 'z', type: 'comment-created', at: '2026-11-01T10:00:00.000Z', gameId: null, summary: 'Z' },
      { id: 'a', type: 'comment-created', at: '2026-11-01T10:00:00.000Z', gameId: null, summary: 'A' },
    ];
    expect(sortTimeline(tie).map((event) => event.id)).toEqual(['a', 'z']);
  });
});
