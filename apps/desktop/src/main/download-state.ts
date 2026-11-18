/**
 * Estado de downloads e fontes no processo principal.
 *
 * Uma instância do launcher, um registro de fontes e uma fila — criados no
 * arranque e partilhados pelo IPC. O motor (`@nexora/download`) corre **no
 * computador do utilizador**: os ficheiros aterram no disco dele, e a API só
 * serve o catálogo.
 *
 * Quando um jogo termina, ele entra na **biblioteca local**: o executável é
 * detectado a partir dos caminhos que o próprio manifesto declara — nunca
 * adivinhado.
 */

import { existsSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DownloadQueue, type DownloadEvent } from '@nexora/download';
import { createSourceRegistry, type SourceRegistry, type UnifiedGame } from '@nexora/sources';
import type { LocalLibrary } from './db.js';
import { externalKeyFor } from './naming.js';
import { localCoverFile } from './import-service.js';

/** Cria o estado partilhado (registro + fila + biblioteca local). */
export function createDownloadState(library: LocalLibrary): DownloadState {
  const registry = createSourceRegistry();
  const queue = new DownloadQueue();

  // **Um** ouvinte para toda a fila: quando uma tarefa termina, o jogo
  // entra na biblioteca local. Um ouvinte por download acumularia listeners
  // a cada instalação — e a memória do launcher cresceria sem parar.
  queue.on((event: DownloadEvent) => {
    if (event.task.state !== 'completed') {
      return;
    }
    registerCompletedTask(registry, library, event.task.gameId, event.task.destinationPath);
  });

  return { registry, queue, library };
}

/** Estado partilhado do launcher. */
export interface DownloadState {
  readonly registry: SourceRegistry;
  readonly queue: DownloadQueue;
  readonly library: LocalLibrary;
}

/** Erro de uma operação de fonte/download (chave de tradução + texto). */
export interface SourceError {
  readonly code: 'manifest-invalid' | 'source-not-found' | 'torrent-unavailable' | 'game-not-found' | 'file-missing';
  readonly message: string;
}

/** Resultado de instalar um manifesto a partir de um ficheiro. */
export type InstallFileResult =
  | { readonly ok: true; readonly sourceId: string }
  | { readonly ok: false } & SourceError;

/**
 * Instala um manifesto a partir de um ficheiro JSON escolhido pelo operador.
 *
 * A leitura é do caminho escolhido (o renderer nunca vê caminhos): o ficheiro
 * é lido, validado pelo `@nexora/sources` e recusado sem attestation.
 */
export async function installManifestFile(state: DownloadState, manifestPath: string): Promise<InstallFileResult> {
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch {
    return { ok: false, code: 'file-missing', message: `Manifesto não encontrado: ${manifestPath}` };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'manifest-invalid', message: 'Manifesto não é JSON válido.' };
  }

  const result = state.registry.install(parsed, manifestPath);
  if (!result.ok) {
    return { ok: false, code: 'manifest-invalid', message: result.issues.join('; ') };
  }
  return { ok: true, sourceId: result.source.manifest.id };
}

/** Resultado de pedir o download de um jogo do catálogo unificado. */
export type QueueGameResult =
  | { readonly ok: true; readonly taskIds: readonly string[]; readonly destinationPath: string }
  | { readonly ok: false } & SourceError;

/**
 * Põe na fila os ficheiros de um jogo do catálogo unificado.
 *
 * Um jogo só-torrent é recusado com motivo honesto (o cliente de torrent é
 * `planned`), e a verificação de espaço é do motor — antes de escrever o
 * primeiro byte.
 */
export async function queueGame(
  state: DownloadState,
  unifiedId: string,
  destinationRoot: string,
): Promise<QueueGameResult> {
  const game: UnifiedGame | null = state.registry.game(unifiedId);
  if (game === null) {
    return { ok: false, code: 'game-not-found', message: `Jogo não encontrado: ${unifiedId}` };
  }

  const source = state.registry.get(game.sourceId);
  const manifestGame = source?.manifest.games.find((entry) => `${source.manifest.id}/${entry.id}` === unifiedId);
  if (source === null || manifestGame === undefined) {
    return { ok: false, code: 'game-not-found', message: `Jogo não encontrado: ${unifiedId}` };
  }

  const httpFiles = manifestGame.files.filter((file) => file.transport === 'http');
  if (httpFiles.length === 0) {
    return {
      ok: false,
      code: 'torrent-unavailable',
      message: 'Este jogo só existe por torrent; o cliente de torrent é fase futura.',
    };
  }

  const destinationPath = join(destinationRoot, slug(game.title));
  const taskIds: string[] = [];
  for (const file of httpFiles) {
    const taskId = `${unifiedId}/${file.path}`;
    state.queue.add({
      taskId,
      gameId: unifiedId,
      url: file.url,
      destinationPath: join(destinationPath, file.path),
      checksum: file.sha256 === undefined ? undefined : { algorithm: 'sha256', value: file.sha256 },
      priority: 1,
    });
    taskIds.push(taskId);
    // A inscrição na biblioteca é feita pelo ouvinte **único** da fila
    // (`createDownloadState`), não por um ouvinte por download: um ouvinte
    // aqui acumularia memória a cada instalação.
  }

  return { ok: true, taskIds, destinationPath };
}

/**
 * Regista um jogo terminado na biblioteca local.
 *
 * O executável é um dos que o **manifesto declara** — se nenhum existir, o
 * jogo não entra (antes isso do que adivinhar um executável e arrancar a
 * coisa errada). A conversa com o manifesto é pelo id unificado, que a fila
 * transporta em `gameId`.
 */
function registerCompletedTask(
  registry: SourceRegistry,
  library: LocalLibrary,
  unifiedId: string,
  destinationPath: string,
): void {
  // O destino declarado é `<raiz>/<slug>/<ficheiro>`: a pasta do jogo é a
  // pasta do ficheiro — não o caminho do ficheiro em si.
  const game = registry.game(unifiedId);
  if (game === null) {
    return;
  }
  const gameFolder = join(destinationPath, '..');
  const executable = game.executables
    .map((relative) => join(gameFolder, relative))
    .find((candidate) => existsSync(candidate));
  if (executable === undefined) {
    return;
  }

  // Um ficheiro transferido não nasce executável: sem permissão, o runner
  // recusaria o arranque e o jogo ficaria "instalado mas morto". O `chmod`
  // é só nos caminhos que o **manifesto** declara como executáveis.
  try {
    chmodSync(executable, 0o755);
  } catch {
    // Sistema de ficheiros sem permissões (exFAT, por exemplo): o runner
    // falhará no arranque com o motivo honesto.
  }

  library.upsert({
    externalKey: externalKeyFor(gameFolder),
    title: game.title,
    cover: localCoverFile(gameFolder),
    installPath: gameFolder,
    executablePath: executable,
    tags: [`fonte:${unifiedId.split('/')[0]}`],
  });
}

/** Nome de pasta seguro a partir de um título (`:` e `\` não sobrevivem). */
function slug(title: string): string {
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'jogo';
}