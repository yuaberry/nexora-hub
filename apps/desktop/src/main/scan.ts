/**
 * Detecção do executável de uma pasta de jogo.
 *
 * A detecção é **heurística e explicável**: pontua cada candidato e devolve o
 * melhor. Não há magia — quando a heurística falha, a importação recusa a
 * pasta com o motivo (`no-executable`), e o utilizador escolhe outra pasta,
 * em vez de o launcher adivinhar e arrancar o instalador.
 */

import { isExecutableName, isNonGameExecutable } from './naming.js';

/** Um candidato encontrado no disco. */
export interface ExecutableCandidate {
  /** Caminho absoluto. */
  readonly path: string;
  /** Nome do ficheiro. */
  readonly name: string;
}

/** Um candidato pontuado (para explicar a decisão nos testes). */
export interface RankedCandidate {
  readonly candidate: ExecutableCandidate;
  readonly score: number;
}

/** Bónus e penalidades da heurística — declaradas, não escondidas. */
const SCORES = {
  windowsExe: 10,
  linuxElf: 8,
  shellScript: 5,
  appImage: 4,
  nonGame: -100,
  commonGameName: 3,
} as const;

/** Pontua um candidato (a profundidade do caminho não entra: é ruído). */
export function scoreExecutable(candidate: ExecutableCandidate, minNameLength = 0): number {
  const { name } = candidate;
  let score = 0;

  const lower = name.toLowerCase();
  if (lower.endsWith('.exe')) {
    score += SCORES.windowsExe;
  } else if (lower.endsWith('.x86_64') || lower.endsWith('.x86')) {
    score += SCORES.linuxElf;
  } else if (lower.endsWith('.appimage')) {
    score += SCORES.appImage;
  } else if (lower.endsWith('.sh')) {
    score += SCORES.shellScript;
  }

  if (isNonGameExecutable(name)) {
    score += SCORES.nonGame;
  }

  // Um nome mais longo costuma ser o do jogo (não `run`, não `start`), mas o
  // bónus é fraco: nunca decide sozinho contra um instalador penalizado.
  if (name.length > minNameLength) {
    score += SCORES.commonGameName;
  }

  return score;
}

/**
 * Ordena candidatos pelo melhor para o pior.
 *
 * Um candidato "não-jogo" só vence se for o **único** — a heurística nunca
 * devolve `null` quando existe algo plausível.
 */
export function rankExecutables(
  candidates: readonly ExecutableCandidate[],
): readonly RankedCandidate[] {
  const executableCandidates = candidates.filter((candidate) =>
    isExecutableName(candidate.name),
  );
  return executableCandidates
    .map((candidate) => ({ candidate, score: scoreExecutable(candidate) }))
    .sort((left, right) => right.score - left.score || left.candidate.name.localeCompare(right.candidate.name));
}

/**
 * Escolhe o executável principal de uma pasta.
 *
 * Devolve `null` quando não há candidato — a importação recusa a pasta com
 * motivo honesto em vez de arrancar o primeiro ficheiro.
 */
export function detectExecutable(
  candidates: readonly ExecutableCandidate[],
): ExecutableCandidate | null {
  const ranked = rankExecutables(candidates);
  if (ranked.length === 0) {
    return null;
  }
  // Um candidato "não-jogo" (instalador, desinstalador) nunca é escolhido
  // enquanto existir outro: a pontuação negativa garante a ordenação, e este
  // filtro só protege o caso de haver um único candidato negativo.
  const best = ranked[0]!;
  if (best.score <= 0) {
    return null;
  }
  return best.candidate;
}