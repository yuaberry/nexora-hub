/**
 * Biblioteca partilhada do grupo — junção pura.
 *
 * A API junta as bibliotecas dos membros e devolve uma lista sem duplicados:
 * o mesmo jogo instalado por duas pessoas aparece **uma vez**, com os dois
 * donos. Nada é somado nem inventado — um jogo que ninguém tem não aparece.
 */

/** Uma entrada de biblioteca (o que a junção consome). */
export interface SharedLibraryEntry {
  readonly userId: string;
  /** Chave estável do jogo (a identidade local). */
  readonly externalKey: string;
  readonly title: string;
}

/** Um jogo na biblioteca partilhada. */
export interface SharedGame {
  readonly externalKey: string;
  readonly title: string;
  /** IDs dos membros que têm o jogo (sem repetição). */
  readonly owners: readonly string[];
}

/**
 * Junta as bibliotecas dos membros.
 *
 * A ordem é determinista — por título, depois por chave — para que a mesma
 * junção dê sempre a mesma lista (um teste que depende da ordem de um `Map`
 * seria um teste instável).
 */
export function mergeSharedLibraries(
  entries: readonly SharedLibraryEntry[],
): readonly SharedGame[] {
  const byKey = new Map<string, { title: string; owners: Set<string> }>();

  for (const entry of entries) {
    const current = byKey.get(entry.externalKey);
    if (current === undefined) {
      byKey.set(entry.externalKey, { title: entry.title, owners: new Set([entry.userId]) });
      continue;
    }
    current.owners.add(entry.userId);
  }

  return [...byKey.entries()]
    .map(([externalKey, value]) => ({
      externalKey,
      title: value.title,
      owners: [...value.owners].sort(),
    }))
    .sort((left, right) => left.title.localeCompare(right.title) || left.externalKey.localeCompare(right.externalKey));
}