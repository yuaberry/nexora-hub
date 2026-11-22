/**
 * Sincronização da biblioteca com a Steam — o que mudou desde a última vez.
 *
 * A Steam actualiza os manifestos quando o jogo muda de versão, instala
 * jogos novos e às vezes muda nomes. Este módulo volta a ler os manifestos e
 * traz essas diferenças para a base local: jogos novos entram, títulos
 * mudados são actualizados, e a **capa que o utilizador escolheu** nunca é
 * mexida — a escolha dele vale mais que a nossa.
 *
 * O relatório diz o que mudou: nada de "sincronizado" sem provas.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSteamAppManifest, parseSteamLibraryFolders, steamInstallPath, steamManifestFileName } from '@nexora/core';
import { LocalLibrary } from './db.js';
import { externalKeyFor } from './naming.js';
import { localCoverFile, scanForExecutables } from './disk-scan.js';
import { detectExecutable } from './scan.js';
import { isKnownToolFolder } from './scan-filter.js';
import { steamCoverFor } from './steam-images.js';
import { steamRoots } from './official-import.js';

/** Lê um ficheiro de texto (`null` quando não existe ou não é legível). */
function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Sincroniza a biblioteca local com o que a Steam tem agora.
 *
 * A Steam actualiza os manifestos quando o jogo muda de versão — e este
 * comando volta a lê-los: títulos novos, jogos instalados desde a última
 * vez, e caminhos que mudaram. A **capa que o utilizador escolheu** nunca é
 * mexida (a escolha dele vale mais que a nossa); a capa automática só é
 * definida quando a entrada não tem nenhuma.
 *
 * O relatório diz o que mudou — nada de "sincronizado" sem provas.
 */
export function syncSteamLibrary(library: LocalLibrary): {
  updated: number;
  added: number;
  unchanged: number;
  titles: readonly string[];
} {
  let updated = 0;
  let added = 0;
  let unchanged = 0;
  const titles: string[] = [];

  for (const entry of steamLibraries()) {
    for (const appId of entry.appIds) {
      const manifestText = readText(join(entry.path, 'steamapps', steamManifestFileName(appId)));
      if (manifestText === null) {
        continue;
      }
      let manifest;
      try {
        manifest = parseSteamAppManifest(manifestText);
      } catch {
        continue;
      }
      if (manifest === null || isKnownToolFolder(manifest.installDir) || isKnownToolFolder(manifest.name)) {
        continue;
      }
      const installPath = steamInstallPath(entry.path, manifest.installDir);
      if (!existsSync(installPath)) {
        continue;
      }
      const externalKey = externalKeyFor(installPath);
      const existing = library.byExternalKey(externalKey);
      const steamCover = steamCoverFor(entry.path, manifest.appId);

      if (existing === null) {
        // Jogo instalado desde a última sincronização.
        const executable = detectExecutable(scanForExecutables(installPath), manifest.installDir);
        if (executable === null) {
          continue;
        }
        library.upsert({
          externalKey,
          title: manifest.name,
          cover: steamCover ?? localCoverFile(installPath),
          installPath,
          executablePath: executable.path,
          steamAppId: manifest.appId === '' ? null : manifest.appId,
        });
        added += 1;
        titles.push(manifest.name);
        continue;
      }

      // Jogo conhecido: o título pode ter mudado (a Steam muda nomes), e a
      // capa automática só entra quando não há nenhuma.
      const titleChanged = existing.title !== manifest.name;
      const coverMissing = existing.cover === null && steamCover !== null;
      const appIdMissing = existing.steamAppId === null && manifest.appId !== '';
      if (titleChanged || coverMissing || appIdMissing) {
        library.upsert({
          externalKey,
          title: manifest.name,
          cover: existing.cover ?? steamCover ?? localCoverFile(installPath),
          installPath,
          executablePath: existing.executablePath,
          steamAppId: existing.steamAppId ?? (manifest.appId === '' ? null : manifest.appId),
        });
        updated += 1;
        titles.push(manifest.name);
        continue;
      }
      unchanged += 1;
    }
  }

  return { updated, added, unchanged, titles };
}

/** As bibliotecas da Steam, lidas uma vez (partilhado com a importação). */
function steamLibraries(): readonly { readonly path: string; readonly appIds: readonly string[] }[] {
  const seen = new Set<string>();
  const libraries: { path: string; appIds: readonly string[] }[] = [];
  for (const root of steamRoots()) {
    const foldersPath = join(root, 'steamapps', 'libraryfolders.vdf');
    const text = readText(foldersPath);
    if (text === null) {
      continue;
    }
    let parsed;
    try {
      parsed = parseSteamLibraryFolders(text);
    } catch {
      continue;
    }
    for (const entry of parsed) {
      if (seen.has(entry.path)) {
        continue;
      }
      seen.add(entry.path);
      libraries.push({ path: entry.path, appIds: entry.appIds });
    }
  }
  return libraries;
}
