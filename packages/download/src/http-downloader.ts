/**
 * Downloader HTTP multi-conexão com retoma.
 *
 * Como funciona, de propósito e sem mágica:
 *
 * 1. um `HEAD` declara o tamanho total e se o servidor aceita intervalos;
 * 2. o ficheiro é dividido em N intervalos, cada um com a **sua** parte
 *    parcial (`<dest>.part.<i>`): uma tarefa interrompida não deixa um
 *    ficheiro esburacado, deixa partes que cada uma sabe retomar;
 * 3. no fim, as partes são concatenadas por ordem num ficheiro único;
 * 4. o checksum declarado é verificado antes de qualquer rename.
 *
 * Sem suporte a intervalos, o downloader cai para uma conexão única e diz
 * `resumable: false` — prometer retoma onde o servidor não a dá seria mentir.
 */

import { createWriteStream } from 'node:fs';
import { open, rename, rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DownloadState, HttpDownloadRequest, SpaceCheck } from './types.js';

/** Intervalo de bytes de uma conexão. */
interface Chunk {
  readonly index: number;
  readonly start: number;
  readonly end: number;
}

/** Resultado de um download completo. */
export interface HttpDownloadOutcome {
  readonly ok: boolean;
  /** Caminho final (só quando `ok`). */
  readonly destinationPath: string | null;
  /** Bytes transferidos nesta execução. */
  readonly downloadedBytes: number;
  /** Total declarado pelo servidor, ou `null`. */
  readonly totalBytes: number | null;
  /** `false` quando o servidor não suporta intervalos. */
  readonly resumable: boolean;
  /** `true` quando o checksum declarado foi verificado. */
  readonly verified: boolean;
  /** Motivo da falha (só quando `!ok`). */
  readonly error: string | null;
}

/** Callbacks de observação (a fila transforma-os em eventos). */
export interface DownloadHooks {
  readonly onState?: (state: DownloadState) => void;
  readonly onProgress?: (receivedBytes: number, totalBytes: number | null, bytesPerSecond: number) => void;
  /** Sinal de aborto (pausa/cancelamento). */
  readonly signal?: AbortSignal;
}

/** Número de conexões por omissão. */
export const DEFAULT_CONNECTIONS = 8;

/** Limite de conexões (declarado — não se abre 1000 sockets). */
export const MAX_CONNECTIONS = 16;

/** Cabeçalho de intervalo: `bytes=início-fim`. */
function rangeHeader(chunk: Chunk): string {
  return `bytes=${chunk.start}-${chunk.end}`;
}

/** Divide um total em N intervalos contíguos. */
export function planChunks(total: number, connections: number): readonly Chunk[] {
  const count = Math.max(1, Math.min(MAX_CONNECTIONS, connections));
  if (total <= 0) {
    return [{ index: 0, start: 0, end: 0 }];
  }
  const size = Math.floor(total / count);
  const chunks: Chunk[] = [];
  let start = 0;
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const end = isLast ? total - 1 : start + size - 1;
    chunks.push({ index, start, end });
    start = end + 1;
  }
  return chunks;
}

/** Declara o tamanho e o suporte a intervalos de uma URL. */
export async function probe(url: string): Promise<{ totalBytes: number | null; resumable: boolean }> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    if (!response.ok) {
      return { totalBytes: null, resumable: false };
    }
    const length = response.headers.get('content-length');
    const acceptRanges = (response.headers.get('accept-ranges') ?? '').toLowerCase() === 'bytes';
    return {
      totalBytes: length === null ? null : Number(length),
      resumable: acceptRanges && Number(length) > 0,
    };
  } catch {
    return { totalBytes: null, resumable: false };
  }
}

/** Espaço do volume do destino, comparado com o que a tarefa precisa. */
export async function checkSpace(destinationPath: string, neededBytes: number | null): Promise<SpaceCheck> {
  const { volumeSpace } = await import('./volume.js');
  const root = dirname(destinationPath);
  const volume = volumeSpace(root);
  const free = volume.freeBytes;
  if (neededBytes === null) {
    // Sem tamanho declarado não há como recusar: segue, e a falha de escrita
    // (se houver) aparece no fim — nunca se mente sobre o que se sabe.
    return { ok: true, freeBytes: free, neededBytes: null, reason: null };
  }
  if (free < neededBytes) {
    return {
      ok: false,
      freeBytes: free,
      neededBytes,
      reason: 'Espaço insuficiente no disco para este download.',
    };
  }
  return { ok: true, freeBytes: free, neededBytes, reason: null };
}

/** Descarrega um ficheiro por HTTP (multi-conexão, com retoma e verificação). */
export async function downloadHttp(request: HttpDownloadRequest, hooks: DownloadHooks = {}): Promise<HttpDownloadOutcome> {
  const connections = Math.max(1, Math.min(MAX_CONNECTIONS, request.connections ?? DEFAULT_CONNECTIONS));

  hooks.onState?.('downloading');
  const probeResult = await probe(request.url);
  if (probeResult.totalBytes !== null) {
    const space = await checkSpace(request.destinationPath, probeResult.totalBytes);
    if (!space.ok) {
      hooks.onState?.('failed');
      return failure(space.reason ?? 'Espaço insuficiente.', probeResult.totalBytes);
    }
  }

  const chunks = planChunks(probeResult.totalBytes ?? 0, probeResult.resumable ? connections : 1);
  const partPaths = chunks.map((chunk) => `${request.destinationPath}.part.${chunk.index}`);

  // Cada conexão escreve a sua parte, retomando do que já tem.
  let results: readonly { readonly index: number; readonly written: number | null }[];
  try {
    results = await Promise.all(
      chunks.map((chunk, index) =>
        downloadChunk(request.url, chunk, partPaths[index]!, hooks.signal).then((written) => ({ index, written })),
      ),
    );
  } catch (cause) {
    // Um aborto **não é uma falha**: é pausa. As partes ficam no disco para
    // retomar — e o estado tem de dizê-lo, não dizer "failed".
    if (hooks.signal?.aborted === true || (cause instanceof Error && cause.name === 'AbortError')) {
      hooks.onState?.('paused');
      return {
        ok: false,
        destinationPath: null,
        downloadedBytes: 0,
        totalBytes: probeResult.totalBytes,
        resumable: probeResult.resumable,
        verified: false,
        error: null,
      };
    }
    hooks.onState?.('failed');
    return failure(cause instanceof Error ? cause.message : 'Falha de rede.', probeResult.totalBytes);
  }

  if (hooks.signal?.aborted === true) {
    hooks.onState?.('paused');
    await cleanupParts(partPaths);
    return {
      ok: false,
      destinationPath: null,
      downloadedBytes: 0,
      totalBytes: probeResult.totalBytes,
      resumable: probeResult.resumable,
      verified: false,
      error: 'Download interrompido.',
    };
  }

  const failed = results.find((result) => result.written === null);
  if (failed !== undefined) {
    hooks.onState?.('failed');
    return failure('Uma ou mais conexões falharam.', probeResult.totalBytes);
  }

  // Concatena as partes por ordem.
  await concatParts(partPaths, request.destinationPath);
  await cleanupParts(partPaths);

  hooks.onState?.('verifying');
  if (request.checksum !== undefined) {
    const { verifyFile } = await import('./checksum.js');
    const matches = await verifyFile(request.destinationPath, request.checksum.value);
    if (!matches) {
      hooks.onState?.('failed');
      return {
        ok: false,
        destinationPath: null,
        downloadedBytes: probeResult.totalBytes ?? 0,
        totalBytes: probeResult.totalBytes,
        resumable: probeResult.resumable,
        verified: false,
        error: 'Checksum divergente: o ficheiro não corresponde ao manifesto.',
      };
    }
    hooks.onProgress?.(probeResult.totalBytes ?? 0, probeResult.totalBytes, 0);
  }

  hooks.onState?.('completed');
  return {
    ok: true,
    destinationPath: request.destinationPath,
    downloadedBytes: probeResult.totalBytes ?? 0,
    totalBytes: probeResult.totalBytes,
    resumable: probeResult.resumable,
    verified: request.checksum !== undefined,
    error: null,
  };
}

/** Resultado de falha com o motivo. */
function failure(reason: string, totalBytes: number | null): HttpDownloadOutcome {
  return {
    ok: false,
    destinationPath: null,
    downloadedBytes: 0,
    totalBytes,
    resumable: false,
    verified: false,
    error: reason,
  };
}

/**
 * Descarrega um intervalo para a sua parte parcial.
 *
 * Devolve os bytes escritos, ou `null` em falha. A parte existente é
 * retomada (o intervalo já feito não é pedido outra vez) — é o que torna a
 * retoma real em conexões múltiplas.
 */
async function downloadChunk(
  url: string,
  chunk: Chunk,
  partPath: string,
  signal: AbortSignal | undefined,
): Promise<number | null> {
  let start = chunk.start;
  const existing = await fileSize(partPath);
  if (existing !== null && existing > 0 && existing <= chunk.end - chunk.start + 1) {
    start = chunk.start + existing;
  }

  if (start > chunk.end) {
    return chunk.end - chunk.start + 1;
  }

  const response = await fetch(url, {
    headers: { range: rangeHeader({ ...chunk, start }) },
    ...(signal === undefined ? {} : { signal }),
  });
  if (!response.ok && response.status !== 206) {
    return null;
  }
  if (response.body === null) {
    return null;
  }

  const handle = await open(partPath, existing === null ? 'w' : 'a');
  try {
    const reader = response.body.getReader();
    let written = start - chunk.start;
    for (;;) {
      const { done, value } = await reader.read();
      if (done === true) {
        break;
      }
      if (value !== undefined) {
        await handle.write(value);
        written += value.byteLength;
      }
    }
    return written;
  } finally {
    await handle.close();
  }
}

/** Concatena as partes por ordem no ficheiro final. */
async function concatParts(partPaths: readonly string[], destinationPath: string): Promise<void> {
  const output = createWriteStream(destinationPath);
  for (const part of partPaths) {
    const { createReadStream } = await import('node:fs');
    await new Promise<void>((resolve, reject) => {
      const input = createReadStream(part);
      input.on('error', reject);
      output.on('error', reject);
      input.pipe(output, { end: false });
      input.on('end', () => resolve());
    });
  }
  await new Promise<void>((resolve, reject) => {
    output.end(() => resolve());
    output.on('error', reject);
  });
}

/** Apaga as partes parciais (o ficheiro final ficou completo). */
async function cleanupParts(partPaths: readonly string[]): Promise<void> {
  await Promise.all(partPaths.map((part) => rm(part, { force: true })));
}

/** Tamanho de um ficheiro, ou `null` se não existir. */
async function fileSize(path: string): Promise<number | null> {
  try {
    const stats = await stat(path);
    return stats.size;
  } catch {
    return null;
  }
}

/** Renomeia mantendo o caminho final (usado pelos testes e pela fila). */
export async function moveIntoPlace(partialPath: string, destinationPath: string): Promise<void> {
  await rename(partialPath, destinationPath);
}