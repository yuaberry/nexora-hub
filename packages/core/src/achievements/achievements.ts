/**
 * Conquistas — regras sobre o que o jogador **realmente** jogou.
 *
 * Cada conquista é uma regra pura sobre o histórico de sessões: nada é
 * desbloqueado por estar muito tempo com o launcher aberto, nada é
 * desbloqueado por clicar. As que não se alcançaram devolvem o progresso
 * (0–1) — a interface mostra a barra, não uma mentira.
 */

import type { SessionSample, StatsSummary } from '../stats/aggregate.js';

/** Uma conquista. */
export interface Achievement {
  readonly id: string;
  /** Chave de tradução do nome (`achievement.<id>`). */
  readonly labelKey: string;
  /** Chave de tradução da descrição. */
  readonly hintKey: string;
  /** O valor a atingir (horas, sessões, jogos…). */
  readonly target: number;
  /** Pontos que dá ao ser desbloqueada. */
  readonly points: number;
}

/** O que a avaliação precisa saber. */
export interface AchievementInput {
  /** O resumo das estatísticas (agregado pelo servidor). */
  readonly summary: StatsSummary;
  /** As sessões do utilizador (para as regras que olham para cada uma). */
  readonly sessions: readonly SessionSample[];
}

/** O estado de uma conquista para um utilizador. */
export interface AchievementProgress {
  readonly achievement: Achievement;
  /** Valor actual da métrica. */
  readonly value: number;
  /** Progresso entre 0 e 1. */
  readonly progress: number;
  /** `true` quando a regra já se cumpre. */
  readonly unlocked: boolean;
}

/** O catálogo — a fonte da verdade das conquistas. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-session',
    labelKey: 'achievement.firstSession',
    hintKey: 'achievement.hint.firstSession',
    target: 1,
    points: 10,
  },
  {
    id: 'ten-hours',
    labelKey: 'achievement.tenHours',
    hintKey: 'achievement.hint.tenHours',
    target: 10,
    points: 50,
  },
  {
    id: 'hundred-hours',
    labelKey: 'achievement.hundredHours',
    hintKey: 'achievement.hint.hundredHours',
    target: 100,
    points: 250,
  },
  {
    id: 'five-games',
    labelKey: 'achievement.fiveGames',
    hintKey: 'achievement.hint.fiveGames',
    target: 5,
    points: 40,
  },
  {
    id: 'night-owl',
    labelKey: 'achievement.nightOwl',
    hintKey: 'achievement.hint.nightOwl',
    target: 1,
    points: 30,
  },
  {
    id: 'marathon',
    labelKey: 'achievement.marathon',
    hintKey: 'achievement.hint.marathon',
    target: 1,
    points: 60,
  },
];

/** Uma conquista pelo identificador (`undefined` quando não existe). */
export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

/** Pontos de uma conquista (0 quando não existe). */
export function pointsOf(id: string): number {
  return achievementById(id)?.points ?? 0;
}

/**
 * O valor da métrica de uma conquista, a partir dos dados reais.
 *
 * Horas, sessões e jogos distintos vêm do resumo agregado; a coruja e a
 * maratona olham para as sessões uma a uma. Um valor desconhecido é 0 — não
 * inventado.
 */
export function achievementValue(achievement: Achievement, input: AchievementInput): number {
  switch (achievement.id) {
    case 'first-session':
      return input.summary.sessionCount;
    case 'ten-hours':
    case 'hundred-hours':
      return input.summary.totalHours;
    case 'five-games':
      return input.summary.distinctGames;
    case 'night-owl':
      // Uma sessão começada entre a meia-noite e as 5 da manhã.
      return input.sessions.some((session) => {
        const hour = new Date(session.startedAt).getUTCHours();
        return hour >= 0 && hour < 5;
      })
        ? 1
        : 0;
    case 'marathon': {
      // Uma sessão de duas horas ou mais.
      const longest = input.sessions.reduce(
        (best, session) => Math.max(best, session.durationSeconds / 3600),
        0,
      );
      return longest >= 2 ? 1 : 0;
    }
    default:
      return 0;
  }
}

/**
 * Avalia uma conquista: valor, progresso e se está desbloqueada.
 *
 * O progresso é limitado a 1: uma barra a 130 % seria uma mentira com cara de
 * progresso.
 */
export function evaluateAchievement(
  achievement: Achievement,
  input: AchievementInput,
): AchievementProgress {
  const value = achievementValue(achievement, input);
  const progress = achievement.target <= 0 ? 0 : Math.min(1, value / achievement.target);
  return { achievement, value, progress, unlocked: value >= achievement.target };
}

/** Avalia o catálogo inteiro. */
export function evaluateAchievements(
  input: AchievementInput,
): readonly AchievementProgress[] {
  return ACHIEVEMENTS.map((achievement) => evaluateAchievement(achievement, input));
}

/** Pontos possíveis no total (o que o catálogo dá). */
export function totalPointsAvailable(): number {
  return ACHIEVEMENTS.reduce((total, achievement) => total + achievement.points, 0);
}