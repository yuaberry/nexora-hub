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
  /** Bónus do candidato que combina com o nome da pasta. */
  folderMatch: 25,
} as const;

/**
 * Pontua um candidato.
 *
 * O contexto que faltava à heurística: o **nome da pasta**. Um jogo chama-se
 * como a pasta que o contém — `Hollow Knight/hollow_knight.exe` é o jogo;
 * `.../discord/bridge.exe` é ferramenta de terceiro que veio no pacote. Sem
 * olhar para a pasta, a detecção escolhia o `bridge.exe` do Discord dentro de
 * `league-of-legends` — e o utilizador ficava com um atalho que abre o
 * Discord.
 */
export function scoreExecutable(
  candidate: ExecutableCandidate,
  minNameLength = 0,
  folderName?: string,
): number {
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

  // O candidato que "combina" com a pasta ganha um bónus declarado: é o sinal
  // mais forte de que é o executável do jogo.
  if (folderName !== undefined && nameMatchesFolder(name, folderName)) {
    score += SCORES.folderMatch;
  }

  return score;
}

/**
 * `true` quando o nome do ficheiro "combina" com o da pasta.
 *
 * Comparação por esqueleto de consoantes (sem extensão): `hollow_knight` e
 * `Hollow Knight` têm o mesmo esqueleto — e é essa comparação que não depende
 * de underscore, espaço ou capitalização.
 */
export function nameMatchesFolder(fileName: string, folderName: string): boolean {
  const skeletonOf = (value: string): string =>
    value
      .toLowerCase()
      .replace(/\.[a-z0-9]+$/, '')
      .replace(/[^a-z0-9]/g, '')
      .replace(/[aeiou]/g, '');

  const fileSkeleton = skeletonOf(fileName);
  const folderSkeleton = skeletonOf(folderName);
  if (fileSkeleton === '' || folderSkeleton === '') {
    return false;
  }
  return fileSkeleton === folderSkeleton || folderSkeleton.startsWith(fileSkeleton) || fileSkeleton.startsWith(folderSkeleton);
}

/**
 * Ordena candidatos pelo melhor para o pior.
 *
 * Um candidato "não-jogo" só vence se for o **único** — a heurística nunca
 * devolve `null` quando existe algo plausível.
 */
export function rankExecutables(
  candidates: readonly ExecutableCandidate[],
  folderName?: string,
): readonly RankedCandidate[] {
  const executableCandidates = candidates.filter((candidate) =>
    isExecutableName(candidate.name),
  );
  return executableCandidates
    .map((candidate) => ({ candidate, score: scoreExecutable(candidate, 0, folderName) }))
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
  folderName?: string,
): ExecutableCandidate | null {
  const ranked = rankExecutables(candidates, folderName);
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