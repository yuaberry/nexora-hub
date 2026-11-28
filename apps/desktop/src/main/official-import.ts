/**
 * Importação das bibliotecas oficiais — o que a Steam escreveu no disco.
 *
 * A NEXORA não distribui jogos e não fala com a Internet aqui: lê os
 * **manifestos locais** das lojas que o utilizador tem instaladas. O valor
 * não é descobrir jogos novos — é dar o **título real** a pastas com nomes
 * encurtados (`REPO` → `R.E.P.O.`) e o executável correcto, sem adivinhar.
 *
 * Epic e GOG ainda **não** são lidas: não há formato local verificado para
 * as suas ferramentas em Linux, e inventar um seria criar entradas erradas.
 * A interface recebe o relatório com o motivo — honesto, não ausente.
 */

import { existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  parseSteamAppManifest,
  parseSteamLibraryFolders,
  steamInstallPath,
  steamManifestFileName,
  VdfParseError,
} from '@nexora/core';
import { LocalLibrary } from './db.js';
import { externalKeyFor } from './naming.js';
import { localCoverFile, scanForExecutables } from './disk-scan.js';
import { detectExecutable } from './scan.js';
import { isKnownToolFolder } from './scan-filter.js';
import { steamCoverFor } from './steam-images.js';

/** Uma loja verificada e o que ela deu. */
export interface OfficialStoreReport {
  /** Identificador da loja (`steam`, `epic`, `gog`). */
  readonly store: string;
  /** Chave de tradução do nome da loja. */
  readonly labelKey: string;
  /** Títulos importados ou actualizados (o mesmo título não repete). */
  readonly titles: readonly string[];
  /** Ficheiros ignorados — ferramentas, pastas em falta, manifestos partidos. */
  readonly skipped: number;
  /** Motivo quando a loja não deu nada (com o que falta saber). */
  readonly reasonKey?: 'official.reason.notFound' | 'official.reason.notInstalled' | 'official.reason.unverified';
}

/** Resultado completo da importação oficial. */
export interface OfficialImportView {
  readonly imported: readonly string[];
  readonly scanned: number;
  readonly stores: readonly OfficialStoreReport[];
}

/**
 * Raízes conhecidas da Steam em Linux.
 *
 * Nativas, Flatpak e Snap — porque a mesma biblioteca vive em sítios
 * diferentes conforme a forma de instalação, e nenhum caminho é adivinhado:
 * cada um só é usado se existir.
 */
export function steamRoots(): readonly string[] {
  const home = homedir();
  return [
    join(home, '.steam', 'steam'),
    join(home, '.local', 'share', 'Steam'),
    join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam'),
    join(home, 'snap', 'steam', 'common', '.local', 'share', 'Steam'),
  ];
}

/** Lê um ficheiro de texto (`null` quando não existe ou não é legível). */
function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * O texto do ficheiro das bibliotecas da Steam, onde ele estiver.
 *
 * O sítio normal é `steamapps/libraryfolders.vdf` — mas há instalações
 * (mais antigas, e a desta máquina) que o escrevem em `config/`, e há
 * clientes que não o escrevem de todo. Um ficheiro em falta **não** pode
 * significar "não há jogos": sem ele, a importação lê os manifestos do
 * próprio `steamapps`, que são a fonte da verdade do que está instalado.
 */
function libraryFoldersText(root: string): { readonly text: string | null } {
  return {
    text: readText(join(root, 'steamapps', 'libraryfolders.vdf')) ?? readText(join(root, 'config', 'libraryfolders.vdf')),
  };
}

/**
 * Os AppIDs instalados numa pasta `steamapps` (pelos manifestos).
 *
 * Esta é a leitura que não pode faltar: um `libraryfolders.vdf` desactualizado
 * — ou um cliente que não o escreva — esconderia jogos que estão instalados,
 * e a queixa "instalei o jogo e não aparece" nasce exactamente aí. Os
 * manifestos são escritos pela loja a cada instalação, e são por isso a
 * fonte mais fresca do que existe no disco.
 */
function installedAppIds(steamapps: string): readonly string[] {
  let entries: readonly string[];
  try {
    entries = readdirSync(steamapps);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.startsWith('appmanifest_') && name.endsWith('.acf'))
    .map((name) => name.slice('appmanifest_'.length, -'.acf'.length))
    .filter((id) => /^\d+$/.test(id));
}

/** Caminho real (o symlink `~/.steam/steam` conta como o destino). */
function realPath(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

/** As bibliotecas de uma raiz: as do ficheiro (se houver) e as do disco, unidas. */
function librariesOfRoot(root: string, foldersText: string | null): readonly { readonly path: string; readonly appIds: readonly string[] }[] {
  const uniao = new Map<string, Set<string>>();
  if (foldersText !== null) {
    try {
      for (const entry of parseSteamLibraryFolders(foldersText)) {
        // A chave é o caminho real: o ficheiro pode dar um caminho e a raiz
        // ser um atalho para o mesmo sítio — sem resolver, a mesma biblioteca
        // entra duas vezes na união.
        const chave = realPath(entry.path);
        const actual = uniao.get(chave) ?? new Set<string>();
        for (const appId of entry.appIds) {
          actual.add(appId);
        }
        uniao.set(chave, actual);
      }
    } catch {
      // ficheiro ilegível: os manifestos do disco chegam
    }
  }
  // Sempre o que está no disco desta raiz (ver `installedAppIds`).
  const chaveRaiz = realPath(root);
  const actual = uniao.get(chaveRaiz) ?? new Set<string>();
  for (const appId of installedAppIds(join(root, 'steamapps'))) {
    actual.add(appId);
  }
  uniao.set(chaveRaiz, actual);
  return [...uniao.entries()].map(([path, appIds]) => ({ path, appIds: [...appIds] }));
}

/**
 * As raízes sem repetição, pelo caminho real.
 *
 * `~/.steam/steam` é um atalho para `~/.local/share/Steam`: sem resolver o
 * caminho, a mesma biblioteca é lida duas vezes e o relatório lista o mesmo
 * jogo duas vezes — um número que não é o número.
 */
function dedupeRoots(roots: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const unicas: string[] = [];
  for (const root of roots) {
    const real = realPath(root);
    if (seen.has(real)) {
      continue;
    }
    seen.add(real);
    unicas.push(real);
  }
  return unicas;
}

/**
 * Importa a biblioteca da Steam.
 *
 * Por cada jogo: o título real do manifesto, o executável detectado na pasta
 * de instalação, e a capa local se existir. Ferramentas da própria Steam
 * (Proton, runtimes) nunca entram — a lista é a mesma do scan de disco.
 */
export function importSteamLibrary(
  library: LocalLibrary,
  roots: readonly string[] = steamRoots(),
): OfficialStoreReport {
  const seen = new Set<string>();
  const titles: string[] = [];
  let skipped = 0;

  for (const root of dedupeRoots(roots)) {
    // As bibliotecas desta raiz: o ficheiro das bibliotecas e os manifestos
    // do disco, unidos — um jogo instalado nunca pode faltar por o ficheiro
    // estar desactualizado.
    const libraries = librariesOfRoot(root, libraryFoldersText(root).text);

    for (const entry of libraries) {
      // A mesma biblioteca aparece em várias raízes (o `~/.steam/steam` é
      // um atalho para `~/.local/share/Steam`): lê-la duas vez não faz mal,
      // mas duplicar o relatório faz.
      if (seen.has(entry.path)) {
        continue;
      }
      seen.add(entry.path);

      for (const appId of entry.appIds) {
        const manifestText = readText(join(entry.path, 'steamapps', steamManifestFileName(appId)));
        if (manifestText === null) {
          skipped += 1;
          continue;
        }
        let manifest;
        try {
          manifest = parseSteamAppManifest(manifestText);
        } catch (error) {
          // Manifesto partido (a Steam escreve temporários enquanto baixa):
          // salta o ficheiro com o motivo, sem entrada inventada.
          if (!(error instanceof VdfParseError)) {
            throw error;
          }
          skipped += 1;
          continue;
        }
        if (manifest === null) {
          skipped += 1;
          continue;
        }
        if (isKnownToolFolder(manifest.installDir) || isKnownToolFolder(manifest.name)) {
          skipped += 1;
          continue;
        }
        const installPath = steamInstallPath(entry.path, manifest.installDir);
        if (!existsSync(installPath)) {
          // A pasta mudou de sítio (disco desmontado): não há o que importar.
          skipped += 1;
          continue;
        }
        const executable = detectExecutable(scanForExecutables(installPath), manifest.installDir);
        if (executable === null) {
          skipped += 1;
          continue;
        }
        library.upsert({
          externalKey: externalKeyFor(installPath),
          title: manifest.name,
          // A capa é a imagem que a **Steam** guardou para o jogo (o logo,
          // quando existe): está no disco do utilizador, e por isso a
          // biblioteca continua completa offline. A capa local da pasta é a
          // reserva, e o placeholder do tema é o último recurso.
          cover: steamCoverFor(entry.path, manifest.appId) ?? localCoverFile(installPath),
          installPath,
          executablePath: executable.path,
          // O appid fica guardado: é o que permite abrir o jogo no cliente
          // oficial da Steam (o caminho legítimo para jogar como a loja
          // corre — Proton, Steamworks e servidores oficiais incluídos).
          steamAppId: manifest.appId === '' ? null : manifest.appId,
        });
        titles.push(manifest.name);
      }
    }
  }

  return {
    store: 'steam',
    labelKey: 'official.store.steam',
    titles,
    skipped,
    reasonKey: titles.length === 0 ? 'official.reason.notFound' : undefined,
  };
}

/**
 * Importa o que as lojas oficiais escreveram no disco.
 *
 * Epic e GOG entram no relatório como **não verificadas**: não há formato
 * local confirmado para as suas ferramentas em Linux, e a interface diz-o em
 * vez de fingir uma importação que não existe.
 */
export function importOfficial(library: LocalLibrary, roots?: readonly string[]): OfficialImportView {
  const steam = importSteamLibrary(library, roots);
  const stores: readonly OfficialStoreReport[] = [
    steam,
    { store: 'epic', labelKey: 'official.store.epic', titles: [], skipped: 0, reasonKey: 'official.reason.unverified' },
    { store: 'gog', labelKey: 'official.store.gog', titles: [], skipped: 0, reasonKey: 'official.reason.unverified' },
  ];
  return {
    imported: stores.flatMap((entry) => entry.titles),
    scanned: stores.reduce((total, entry) => total + entry.titles.length + entry.skipped, 0),
    stores,
  };
}

/** Registra se a Steam está instalada (diagnóstico para a interface). */
export function steamInstalled(roots: readonly string[] = steamRoots()): boolean {
  return roots.some((root) => existsSync(join(root, 'steamapps', 'libraryfolders.vdf')));
}

/**
 * URL do protocolo da Steam para arrancar um jogo pelo appid.
 *
 * `steam://rungameid/<id>` é o protocolo que o **próprio cliente** da Steam
 * registou no sistema: aberto, o jogo corre pela Steam — com a licença do
 * utilizador, o Proton escolhido por ela, o Steamworks e os servidores
 * oficiais. É o handoff legítimo para o launcher oficial (Fase 2b): quem
 * tem o jogo, joga exactamente como jogaria pela loja.
 *
 * `null` quando o appid não é um número — um URL inventado não abre nada.
 */
export function steamRunUrl(appId: string | null): string | null {
  if (appId === null || !/^\d+$/.test(appId.trim())) {
    return null;
  }
  return `steam://rungameid/${appId.trim()}`;
}

/** Nome base de um caminho (reexportado para os testes). */
export { basename } from 'node:path';
