/**
 * Reputação — os níveis da comunidade, com regras puras.
 *
 * A reputação não é um número mágico: nasce dos **pontos reais** que o
 * utilizador tem (conquistas, participação) e sobe por limiares declarados.
 * Um limiar é uma fronteira clara — quem está a 90 não é "quase Prata" por
 * sentimento, é por conta.
 *
 * Tudo aqui é puro: os limiares e o progresso são testados sem rede nem base
 * de dados.
 */

/** Um nível de reputação (o limiar é inclusivo). */
export interface ReputationLevel {
  /** Chave de tradução do nome (`reputation.level.bronze`…). */
  readonly key: string;
  /** Pontos a partir dos quais o nível vale (inclusivo). */
  readonly from: number;
}

/**
 * Os níveis, do mais baixo ao mais alto.
 *
 * A ordem é declarada: o primeiro nível começa em zero (todos começam em
 * algum lado), e o último não tem tecto — o progresso depois dele é o
 * prestígio de ficar lá.
 */
export const REPUTATION_LEVELS: readonly ReputationLevel[] = [
  { key: 'reputation.level.bronze', from: 0 },
  { key: 'reputation.level.silver', from: 100 },
  { key: 'reputation.level.gold', from: 500 },
  { key: 'reputation.level.platinum', from: 2_000 },
  { key: 'reputation.level.diamond', from: 10_000 },
];

/** O nível de quem tem estes pontos. */
export function levelFor(points: number): ReputationLevel {
  let current = REPUTATION_LEVELS[0] ?? { key: 'reputation.level.bronze', from: 0 };
  for (const level of REPUTATION_LEVELS) {
    if (points >= level.from) {
      current = level;
    }
  }
  return current;
}

/** O progresso até ao nível seguinte. */
export interface ReputationProgress {
  readonly points: number;
  /** O nível actual. */
  readonly current: ReputationLevel;
  /** O nível seguinte (`null` quando já não há mais). */
  readonly next: ReputationLevel | null;
  /** A fracação do caminho até ao próximo (0–1; 0 no último nível). */
  readonly fraction: number;
  /** Pontos que faltam para o próximo nível (0 no último). */
  readonly remaining: number;
}

/**
 * O progresso de quem tem estes pontos.
 *
 * A fracão é aritmética honesta: `(pontos - de) / (próximo - de)`. No último
 * nível não há para onde subir — a fracação é 0 e o resto é 0, sem fingir um
 * objectivo que não existe.
 */
export function reputationProgress(points: number): ReputationProgress {
  const total = Math.max(0, Math.floor(points));
  const current = levelFor(total);
  const index = REPUTATION_LEVELS.indexOf(current);
  const next = REPUTATION_LEVELS[index + 1] ?? null;
  if (next === null) {
    return { points: total, current, next: null, fraction: 0, remaining: 0 };
  }
  const span = next.from - current.from;
  const done = total - current.from;
  return {
    points: total,
    current,
    next,
    fraction: span <= 0 ? 0 : Math.min(1, Math.max(0, done / span)),
    remaining: Math.max(0, next.from - total),
  };
}