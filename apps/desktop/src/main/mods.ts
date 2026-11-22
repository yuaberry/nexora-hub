/**
 * Detector de modos — a pasta `mods` de um jogo, lida de verdade.
 *
 * A detecção corre sobre os **ficheiros do utilizador**: cada `.jar` é um
 * zip, e o carregador declara-se por um ficheiro dentro dele. As ferramentas
 * são as do sistema (`unzip`) — a mesmaaparelhagem que a extracção de
 * downloads já usa, sem uma dependência nova.
 *
 * Os leitores são **injectáveis**: os testes correm com um mapa em memória, e
 * o launcher corre com o `unzip` do sistema.
 */

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { detectMods, summarizeMods, type ModLoader } from '@nexora/core';

/** Como as entradas de um jar são lidas (injectável). */
export interface ModsReaders {
  readonly listJarEntries: (jarPath: string) => Promise<readonly string[]>;
  readonly readJarEntry: (jarPath: string, entry: string) => Promise<string | null>;
}

/** Um modo na vista do renderer. */
export interface ModView {
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly loader: ModLoader;
  readonly displayName: string | null;
  readonly version: string | null;
}

/** O que a varredura devolve. */
export interface ModsScanView {
  /** A pasta de modos encontrada (`null` quando o jogo não tem). */
  readonly folder: string | null;
  readonly total: number;
  /** Quantidade por carregador. */
  readonly byLoader: readonly { readonly loader: ModLoader; readonly count: number }[];
  /** Arquivos sem marcador conhecido. */
  readonly unknown: number;
  readonly totalBytes: number;
  readonly mods: readonly ModView[];
}

/**
 * As pastas de modos possíveis de uma instalação.
 *
 * A forma como os modos vivem varia por jogo e por lançador: `mods/` ao lado
 * do executável, `.minecraft/mods/` numa instância, ou `mods/` um nível
 * abaixo. A primeira que existe é a usada — nada é adivinhado onde não há
 * pasta.
 */
export function findModsFolders(installPath: string): readonly string[] {
  const candidates: string[] = [join(installPath, 'mods'), join(installPath, '.minecraft', 'mods')];
  let entries: readonly string[] = [];
  try {
    entries = readdirSync(installPath);
  } catch {
    return candidates.filter((path) => existsSync(path));
  }
  for (const entry of entries) {
    const nested = join(installPath, entry, 'mods');
    if (existsSync(nested)) {
      candidates.push(nested);
    }
  }
  return candidates.filter((path) => existsSync(path));
}

/** O leitor real: as ferramentas do sistema (`unzip`). */
export const systemModsReaders: ModsReaders = {
  // O `-Z1` lista uma entrada por linha: a lista é o stdout dividido.
  listJarEntries: async (jarPath) => {
    const output = await runUnzip(['-Z1', jarPath]);
    return output.split('\n').map((line) => line.trim()).filter((line) => line !== '');
  },
  readJarEntry: (jarPath, entry) => runUnzip(['-p', jarPath, entry]),
};

/** Corre o `unzip` e devolve o texto (vazio quando a ferramenta falta ou falha). */
function runUnzip(args: readonly string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile('unzip', [...args], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error !== null) {
        // Jar que não é zip legível, ou `unzip` ausente: não há entradas.
        resolve('');
        return;
      }
      resolve(stdout);
    });
  });
}

/**
 * Procura os modos numa instalação.
 *
 * Só os `.jar` contam — um `mod.jar.disabled` é um modo **desligado**, e
 * contá-lo seria anunciar um modo que não corre.
 */
export async function scanMods(
  installPath: string,
  readers: ModsReaders = systemModsReaders,
): Promise<ModsScanView> {
  const folders = findModsFolders(installPath);
  const folder = folders[0] ?? null;
  if (folder === null) {
    return { folder: null, total: 0, byLoader: [], unknown: 0, totalBytes: 0, mods: [] };
  }

  let files: readonly string[] = [];
  try {
    files = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.jar'));
  } catch {
    files = [];
  }

  // Uma leitura de cada vez, com algum paralelismo: uma pasta com centenas de
  // modos não pode pendurar a varredura.
  const archives = await mapLimit(files, 8, async (fileName) => {
    const jarPath = join(folder, fileName);
    const sizeBytes = statSync(jarPath).size;
    const entries = await readers.listJarEntries(jarPath);
    // O manifesto só é lido quando há um marcador: dois `unzip` por jar
    // conhecido, um por jar desconhecido.
    const marker = markerEntry(entries);
    const manifestText = marker === null ? null : await readers.readJarEntry(jarPath, marker);
    return { fileName, sizeBytes, entries, manifestText };
  });

  const mods = detectMods(archives);
  const resumo = summarizeMods(mods);
  return {
    folder,
    total: resumo.total,
    byLoader: [...resumo.byLoader.entries()].map(([loader, count]) => ({ loader, count })),
    unknown: resumo.unknown,
    totalBytes: resumo.totalBytes,
    mods: mods.map((mod) => ({
      fileName: mod.fileName,
      sizeBytes: mod.sizeBytes,
      loader: mod.loader,
      displayName: mod.displayName,
      version: mod.version,
    })),
  };
}

/** A entrada de manifesto a ler, para o carregador detectado. */
function markerEntry(entries: readonly string[]): string | null {
  const names = new Set(entries);
  for (const entry of ['fabric.mod.json', 'quilt.mod.json', 'META-INF/neoforge.mods.toml', 'META-INF/mods.toml']) {
    if (names.has(entry)) {
      return entry;
    }
  }
  return null;
}

/** Aplica uma função a uma lista com paralelismo limitado. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) {
        return;
      }
      results[index] = await fn(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

