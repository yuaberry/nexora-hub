/**
 * Leitura de pastas de jogo no disco — sem Electron.
 *
 * As funções daqui são puras o suficiente para correrem fora do runtime do
 * Electron (e são testadas assim): nenhuma delas depende de `dialog`, de
 * `app` ou de qualquer API do processo principal. Quem escolhe pasta com
 * diálogo é o `import-service.ts` — que fica com o que precisa do Electron
 * e reexporta o que está aqui.
 */

import { existsSync, readdirSync, type Dirent } from 'node:fs';
import { basename, join } from 'node:path';
import { LocalLibrary } from './db.js';
import { externalKeyFor, isExecutableName, prettyFolderName } from './naming.js';
import { detectExecutable, type ExecutableCandidate } from './scan.js';
import type { ImportResultView } from '../shared/preload-api.js';

/** Limites da procura (declarados: uma pasta enorme não pode pendurar). */
const MAX_SCAN_DEPTH = 4;
const MAX_SCAN_ENTRIES = 2_000;

/** Nomes de ficheiros que costumam ser a capa local de um jogo. */
const COVER_NAMES: readonly string[] = [
  'cover.jpg',
  'cover.png',
  'folder.jpg',
  'folder.png',
  'poster.png',
  'poster.jpg',
  'boxart.png',
  'boxart.jpg',
  'hero.jpg',
  'hero.png',
  'logo.png',
];

/**
 * Procura recursivamente executáveis plausíveis numa pasta.
 *
 * A profundidade é limitada de propósito: jogos costumam ter o executável no
 * topo ou um nível abaixo, e varrer uma árvore inteira é lento e ruidoso.
 */
export function scanForExecutables(
  installPath: string,
  maxDepth = MAX_SCAN_DEPTH,
  maxEntries = MAX_SCAN_ENTRIES,
): readonly ExecutableCandidate[] {
  const found: ExecutableCandidate[] = [];
  let visited = 0;

  const walk = (dir: string, depth: number): void => {
    if (depth > maxDepth || visited >= maxEntries) {
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (visited >= maxEntries) {
        return;
      }
      const full = join(dir, entry.name);
      visited += 1;
      try {
        if (entry.isDirectory()) {
          walk(full, depth + 1);
          continue;
        }
        if (entry.isFile() && isExecutableName(entry.name)) {
          found.push({ path: full, name: entry.name });
        }
      } catch {
        // entrada ilegível é ignorada — a procura continua
      }
    }
  };

  walk(installPath, 0);
  return found;
}

/** Capa local do jogo, se existir alguma (`null` = placeholder do tema). */
export function localCoverFile(installPath: string): string | null {
  let entries: readonly string[];
  try {
    entries = readdirSync(installPath);
  } catch {
    return null;
  }
  for (const name of entries) {
    if (COVER_NAMES.includes(name.toLowerCase())) {
      return join(installPath, name);
    }
  }
  return null;
}

/** Importa uma pasta explicitamente escolhida (sem diálogo — testável). */
export function importFolder(library: LocalLibrary, installPath: string): ImportResultView {
  if (!existsSync(installPath)) {
    return { imported: [], skipped: [{ path: installPath, reasonKey: 'unreadable' }] };
  }

  const candidates = scanForExecutables(installPath);
  // O nome da pasta é o contexto da detecção: o executável do jogo costuma
  // chamar-se como a pasta que o contém.
  const executable = detectExecutable(candidates, basename(installPath));
  if (executable === null) {
    return { imported: [], skipped: [{ path: installPath, reasonKey: 'no-executable' }] };
  }

  library.upsert({
    externalKey: externalKeyFor(installPath),
    title: prettyFolderName(installPath),
    cover: localCoverFile(installPath),
    installPath,
    executablePath: executable.path,
  });

  return { imported: [prettyFolderName(installPath)], skipped: [] };
}