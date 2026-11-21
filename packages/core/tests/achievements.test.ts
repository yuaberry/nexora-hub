import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  achievementById,
  achievementValue,
  evaluateAchievement,
  evaluateAchievements,
  pointsOf,
  totalPointsAvailable,
  type AchievementInput,
} from '../src/achievements/achievements.js';
import { summarizeSessions } from '../src/stats/aggregate.js';

/** O resumo que a agregação produz, a partir das sessões. */
function resumoDe(sessions: readonly { gameId: string; startedAt: string; durationSeconds: number }[]): AchievementInput {
  return { summary: summarizeSessions(sessions, new Map()), sessions };
}

/** Uma sessão a uma hora e dia conhecidos. */
function sessao(gameId: string, hora: number, minutos: number): {
  gameId: string;
  startedAt: string;
  durationSeconds: number;
} {
  return {
    gameId,
    startedAt: `2026-01-01T${String(hora).padStart(2, '0')}:00:00.000Z`,
    durationSeconds: minutos * 60,
  };
}

describe('catálogo', () => {
  it('declara as conquistas com pontos', () => {
    expect(ACHIEVEMENTS.map((a) => a.id)).toEqual([
      'first-session',
      'ten-hours',
      'hundred-hours',
      'five-games',
      'night-owl',
      'marathon',
    ]);
    // Os pontos são o preço de cada conquista — declarados, não inventados.
    expect(pointsOf('hundred-hours')).toBe(250);
    expect(totalPointsAvailable()).toBe(440);
  });

  it('encontra uma conquista pelo identificador', () => {
    expect(achievementById('marathon')?.labelKey).toBe('achievement.marathon');
    expect(achievementById('nao-existe')).toBeUndefined();
    expect(pointsOf('nao-existe')).toBe(0);
  });
});

describe('avaliação', () => {
  it('a primeira sessão desbloqueia a conquista', () => {
    const avaliadas = evaluateAchievements(resumoDe([sessao('hollow-knight', 20, 30)]));
    const primeira = avaliadas.find((a) => a.achievement.id === 'first-session')!;
    expect(primeira.unlocked).toBe(true);
    expect(primeira.value).toBe(1);
  });

  it('sem sessões nada está desbloqueado e o progresso é zero', () => {
    const avaliadas = evaluateAchievements(resumoDe([]));
    expect(avaliadas.every((a) => !a.unlocked)).toBe(true);
    expect(avaliadas.every((a) => a.progress === 0)).toBe(true);
  });

  it('o progresso nunca passa de 1 (barra a 130 % seria mentira)', () => {
    const avaliadas = evaluateAchievements(resumoDe([sessao('hollow-knight', 20, 30)]));
    const primeira = avaliadas.find((a) => a.achievement.id === 'first-session')!;
    expect(primeira.progress).toBe(1);
  });

  it('as dez horas contam as horas reais das sessões', () => {
    // Duas sessões de 5 h = 10 h: a regra cumpre-se exactamente no limite.
    const input = resumoDe([
      sessao('hollow-knight', 20, 300),
      sessao('repo', 21, 300),
    ]);
    expect(achievementValue(achievementById('ten-hours')!, input)).toBe(10);
    expect(evaluateAchievement(achievementById('ten-hours')!, input).unlocked).toBe(true);
  });

  it('cinco jogos distintos contam jogos distintos', () => {
    const input = resumoDe([
      sessao('a', 20, 10),
      sessao('b', 20, 10),
      sessao('c', 20, 10),
      sessao('d', 20, 10),
      sessao('e', 20, 10),
    ]);
    expect(evaluateAchievement(achievementById('five-games')!, input).unlocked).toBe(true);
  });

  it('a coruja é uma sessão entre a meia-noite e as 5 da manhã', () => {
    const deDia = resumoDe([sessao('hollow-knight', 20, 30)]);
    const deMadrugada = resumoDe([sessao('hollow-knight', 3, 30)]);
    expect(achievementValue(achievementById('night-owl')!, deDia)).toBe(0);
    expect(achievementValue(achievementById('night-owl')!, deMadrugada)).toBe(1);
  });

  it('a maratona é uma sessão de duas horas ou mais', () => {
    const curta = resumoDe([sessao('hollow-knight', 20, 90)]);
    const longa = resumoDe([sessao('hollow-knight', 20, 120)]);
    expect(achievementValue(achievementById('marathon')!, curta)).toBe(0);
    expect(achievementValue(achievementById('marathon')!, longa)).toBe(1);
  });
});