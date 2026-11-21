/**
 * Leitura dos manifestos da Steam — função pura.
 *
 * O launcher lê o que a Steam escreveu: `libraryfolders.vdf` (que
 * bibliotecas existem) e `appmanifest_<appid>.acf` (que jogos estão
 * instalados em cada uma). O **título real** do jogo vem daí — não do nome
 * da pasta, que costuma ser encurtado ou críptico (`REPO`, não `R.E.P.O.`).
 *
 * Nada é consultado on-line: são ficheiros do próprio disco do utilizador.
 */

import { parseVdf, vdfObject, vdfString } from './vdf.js';

/** Uma biblioteca da Steam (um caminho e os appids que ela tem). */
export interface SteamLibrary {
  /** Caminho raiz da biblioteca (onde está a pasta `steamapps`). */
  readonly path: string;
  /** Appids declarados nessa biblioteca. */
  readonly appIds: readonly string[];
}

/** Um jogo instalado, como o manifesto o descreve. */
export interface SteamAppManifest {
  readonly appId: string;
  /** Título real, escrito pela Steam. */
  readonly name: string;
  /** Nome da pasta dentro de `steamapps/common`. */
  readonly installDir: string;
  /** Estado da instalação (4 = completamente instalado). */
  readonly stateFlags: number | null;
}

/**
 * Lê `libraryfolders.vdf` e devolve as bibliotecas.
 *
 * O formato tem a forma:
 *
 * ```vdf
 * "libraryfolders"
 * {
 *   "0"
 *   {
 *     "path"  "/home/utilizador/.local/share/Steam"
 *     "apps" { "367520" "5231995691" }
 *   }
 * }
 * ```
 *
 * Uma biblioteca sem `path` é ignorada — um caminho em falta não pode ser
 * lido, e adivinhar onde ela está seria inventar.
 */
export function parseSteamLibraryFolders(text: string): readonly SteamLibrary[] {
  const root = parseVdf(text);
  const folders = vdfObject(root.get('libraryfolders'));
  if (folders === null) {
    return [];
  }
  const libraries: SteamLibrary[] = [];
  for (const entry of folders.values()) {
    // O formato antigo guardava o caminho como valor directo
    // (`"0" "/caminho"`); o actual guarda um objecto com `path`.
    const direct = vdfString(entry);
    if (direct !== null) {
      libraries.push({ path: direct, appIds: [] });
      continue;
    }
    const folder = vdfObject(entry);
    if (folder === null) {
      continue;
    }
    const path = vdfString(folder.get('path'));
    if (path === null || path.trim() === '') {
      continue;
    }
    const apps = vdfObject(folder.get('apps'));
    libraries.push({
      path,
      appIds: apps === null ? [] : [...apps.keys()],
    });
  }
  return libraries;
}

/**
 * Lê um `appmanifest_<appid>.acf` e devolve o jogo, ou `null`.
 *
 * `null` quando o manifesto não tem nome ou pasta de instalação: sem os
 * dois não há jogo para importar — e um manifesto partido a meio (a Steam
 * escreve temporários enquanto baixa) nunca deve dar entrada na biblioteca.
 */
export function parseSteamAppManifest(text: string): SteamAppManifest | null {
  const root = parseVdf(text);
  const state = vdfObject(root.get('AppState'));
  if (state === null) {
    return null;
  }
  const appId = vdfString(state.get('appid'));
  const name = vdfString(state.get('name'));
  const installDir = vdfString(state.get('installdir'));
  if (name === null || name.trim() === '' || installDir === null || installDir.trim() === '') {
    return null;
  }
  const flags = vdfString(state.get('StateFlags'));
  const parsedFlags = flags !== null && /^\d+$/.test(flags.trim()) ? Number(flags.trim()) : null;
  return {
    appId: appId ?? '',
    name,
    installDir,
    stateFlags: parsedFlags,
  };
}

/** Caminho de instalação de um jogo dentro de uma biblioteca. */
export function steamInstallPath(libraryPath: string, installDir: string): string {
  return `${libraryPath.replace(/[/\\]+$/, '')}/steamapps/common/${installDir}`;
}

/** Nome do ficheiro de manifesto de um appid. */
export function steamManifestFileName(appId: string): string {
  return `appmanifest_${appId}.acf`;
}