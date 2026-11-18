/**
 * Fila de downloads.
 *
 * Regras que esta fila impõe (e que a interface mostra, não esconde):
 *
 * - **Prioridade é ordem de início**, não de velocidade: uma tarefa mais
 *   prioritária entra antes; as já em curso não são travadas;
 * - **Espaço é verificado antes**: um download que não cabe no disco é
 *   recusado com o motivo, não falhado a meio;
 * - **Progresso é medido**, somando as partes parciais — uma conexão lenta
 *   não congela a interface;
 * - **Pausa aborta as conexões** e mantém as partes: retomar é continuar,
 *   não recomeçar;
 * - **Verificação é do arquivo completo**: checksum divergente é falha
 *   declarada, nunca instalação silenciosa.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { stat } from 'node:fs/promises';
import { downloadHttp, probe } from './http-downloader.js';
import type { DownloadEvent, DownloadState, DownloadTask, HttpDownloadRequest } from './types.js';

/** Listener de eventos (progresso e estado). */
export type DownloadListener = (event: DownloadEvent) => void;

/** Limites da fila (declarados, não descobertos ao falhar). */
export const MAX_CONCURRENT = 2;
const PROGRESS_INTERVAL_MS = 500;

/** Tarefa interna da fila (o que a fila controla além do contrato). */
interface QueueEntry {
  readonly request: HttpDownloadRequest;
  state: DownloadState;
  receivedBytes: number;
  totalBytes: number | null;
  bytesPerSecond: number;
  attempts: number;
  error: string | null;
  verified: boolean;
  controller: AbortController | null;
  /**
   * Geração da execução em curso.
   *
   * Uma pausa aborta a execução actual, mas o aborto desenrola-se de forma
   * assíncrona: sem este contador, a execução velha escreveria `paused` por
   * cima da execução nova (a retoma ficaria presa em `paused` para sempre).
   * Cada execução só mexe na entrada enquanto for a geração corrente.
   */
  runId: number;
}

/** Cria a fila de downloads. */
export function createDownloadQueue(): DownloadQueue {
  return new DownloadQueue();
}

/** Fila de downloads com prioridade e progresso observável. */
export class DownloadQueue {
  private readonly entries = new Map<string, QueueEntry>();
  private readonly listeners = new Set<DownloadListener>();
  private readonly running = new Set<string>();
  private progressTimer: NodeJS.Timeout | null = null;

  /** Subscreve eventos de progresso/estado. */
  on(listener: DownloadListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Adiciona uma tarefa (a fila recusa um `taskId` repetido). */
  add(request: HttpDownloadRequest): DownloadTask {
    if (this.entries.has(request.taskId)) {
      throw new Error(`Tarefa já existe: ${request.taskId}`);
    }
    const entry: QueueEntry = {
      request,
      state: 'queued',
      receivedBytes: 0,
      totalBytes: null,
      bytesPerSecond: 0,
      attempts: 0,
      error: null,
      verified: false,
      controller: null,
      runId: 0,
    };
    this.entries.set(request.taskId, entry);
    this.emit(entry);
    // A bomba arranca no **microtask**, não imediatamente: um lote de
    // tarefas adicionadas em sequência fica ordenado por prioridade, em vez
    // de cada uma ocupar o lugar livre pela ordem de chegada.
    queueMicrotask(() => {
      void this.pump();
    });
    return this.toTask(entry);
  }

  /** Lista as tarefas (ordenadas por prioridade decrescente). */
  list(): readonly DownloadTask[] {
    return [...this.entries.values()]
      .sort((left, right) => (right.request.priority ?? 0) - (left.request.priority ?? 0))
      .map((entry) => this.toTask(entry));
  }

  /** Estado de uma tarefa, ou `null`. */
  get(taskId: string): DownloadTask | null {
    const entry = this.entries.get(taskId);
    return entry === undefined ? null : this.toTask(entry);
  }

  /** Pausa uma tarefa em curso (as partes ficam para retomar). */
  async pause(taskId: string): Promise<boolean> {
    const entry = this.entries.get(taskId);
    if (entry === undefined || (entry.state !== 'downloading' && entry.state !== 'queued')) {
      return false;
    }
    // Invalidar a geração **antes** do aborto: o desenrolar do aborto é
    // assíncrono e não pode escrever por cima do estado de pausa.
    entry.runId += 1;
    entry.controller?.abort();
    entry.state = 'paused';
    this.emit(entry);
    return true;
  }

  /** Retoma uma tarefa pausada. */
  async resume(taskId: string): Promise<boolean> {
    const entry = this.entries.get(taskId);
    if (entry === undefined || entry.state !== 'paused') {
      return false;
    }
    entry.attempts += 1;
    entry.state = 'queued';
    this.emit(entry);
    void this.pump();
    return true;
  }

  /** Cancela e remove uma tarefa (as partes parciais são apagadas). */
  async cancel(taskId: string): Promise<boolean> {
    const entry = this.entries.get(taskId);
    if (entry === undefined) {
      return false;
    }
    entry.controller?.abort();
    await this.removeParts(entry);
    this.entries.delete(taskId);
    return true;
  }

  /** Para a fila (usado nos testes e no encerramento). */
  dispose(): void {
    if (this.progressTimer !== null) {
      clearInterval(this.progressTimer);
      this.progressTimer = null;
    }
    this.listeners.clear();
    this.entries.clear();
    this.running.clear();
  }

  /** Arranca tarefas enquanto houver lugar (prioridade primeiro). */
  private async pump(): Promise<void> {
    while (this.running.size < MAX_CONCURRENT) {
      // Uma tarefa já em curso **não** volta a ser escolhida: o estado só
      // muda para `downloading` depois do primeiro `await`, e sem este filtro
      // a bomba lançaria a mesma tarefa repetidamente.
      const next = [...this.entries.values()]
        .filter((entry) => entry.state === 'queued' && !this.running.has(entry.request.taskId))
        .sort(
          (left, right) =>
            (right.request.priority ?? 0) - (left.request.priority ?? 0) ||
            left.request.taskId.localeCompare(right.request.taskId),
        )[0];
      if (next === undefined) {
        return;
      }
      this.running.add(next.request.taskId);
      void this.run(next).catch(() => {
        // `run` trata os seus próprios erros; uma rejeição aqui seria bug.
      });
    }
  }

  /** Executa uma tarefa (com pasta destino garantida). */
  private async run(entry: QueueEntry): Promise<void> {
    const { request } = entry;
    entry.attempts += 1;
    entry.runId += 1;
    const runId = entry.runId;
    // Uma execução só mexe na entrada enquanto for a geração corrente.
    const isCurrent = (): boolean => entry.runId === runId;
    /** `true` depois de um evento emitido por esta execução. */
    let emitted = false;
    const emit = (): void => {
      emitted = true;
      this.emit(entry);
    };
    entry.controller = new AbortController();
    this.ensureProgressTimer();

    try {
      await mkdir(dirname(request.destinationPath), { recursive: true });
      const outcome = await downloadHttp(request, {
        signal: entry.controller.signal,
        onState: (state) => {
          if (!isCurrent()) {
            return;
          }
          if (state === 'downloading') {
            entry.state = 'downloading';
          } else if (state === 'verifying') {
            entry.state = 'verifying';
          } else if (state === 'completed') {
            entry.state = 'completed';
          } else if (state === 'failed') {
            entry.state = 'failed';
          } else if (state === 'paused') {
            entry.state = 'paused';
          }
          emit();
        },
      });

      if (outcome.totalBytes !== null) {
        entry.totalBytes = outcome.totalBytes;
      }
      if (outcome.ok) {
        if (isCurrent()) {
          entry.receivedBytes = outcome.totalBytes ?? 0;
          entry.verified = outcome.verified;
          entry.state = 'completed';
          entry.error = null;
        }
      } else if (isCurrent()) {
        entry.error = outcome.error;
        entry.state = entry.state === 'paused' ? 'paused' : 'failed';
      }
    } catch (cause) {
      // Aborto não é falha: a tarefa foi pausada (as partes ficam para retomar).
      if (isCurrent()) {
        if (entry.controller?.signal.aborted === true || (cause instanceof Error && cause.name === 'AbortError')) {
          entry.state = 'paused';
          entry.error = null;
        } else {
          entry.error = cause instanceof Error ? cause.message : 'Falha inesperada no download.';
          entry.state = 'failed';
        }
      }
    } finally {
      // O lugar liberta-se sempre, e a bomba corre sempre: uma geração nova
      // (retoma) pode estar à espera deste lugar. Só emite se esta execução
      // ainda não tiver emitido — um estado terminal não repete o evento.
      this.running.delete(request.taskId);
      if (isCurrent() && !emitted) {
        emit();
      }
      void this.pump();
    }
  }

  /** Mede o progresso somando as partes parciais (a verdade do disco). */
  private async measureProgress(): Promise<void> {
    for (const entry of this.entries.values()) {
      if (entry.state !== 'downloading') {
        if (entry.bytesPerSecond !== 0) {
          entry.bytesPerSecond = 0;
          this.emit(entry, 'progress');
        }
        continue;
      }
      const received = await this.partsSize(entry);
      entry.receivedBytes = received;
      this.emit(entry, 'progress');
    }
  }

  /** Soma do tamanho das partes parciais de uma tarefa. */
  private async partsSize(entry: QueueEntry): Promise<number> {
    let total = 0;
    for (let index = 0; index < 16; index += 1) {
      const size = await this.fileSize(`${entry.request.destinationPath}.part.${index}`);
      if (size === null) {
        break;
      }
      total += size;
    }
    return total;
  }

  /** Tamanho de um ficheiro, ou `null`. */
  private async fileSize(path: string): Promise<number | null> {
    try {
      const stats = await stat(path);
      return stats.size;
    } catch {
      return null;
    }
  }

  /** Apaga as partes parciais de uma tarefa. */
  private async removeParts(entry: QueueEntry): Promise<void> {
    const { rm } = await import('node:fs/promises');
    for (let index = 0; index < 16; index += 1) {
      await rm(`${entry.request.destinationPath}.part.${index}`, { force: true });
    }
  }

  /** Converte uma entrada interna na vista do contrato. */
  private toTask(entry: QueueEntry): DownloadTask {
    return {
      taskId: entry.request.taskId,
      gameId: entry.request.gameId,
      url: entry.request.url,
      destinationPath: entry.request.destinationPath,
      state: entry.state,
      receivedBytes: entry.receivedBytes,
      totalBytes: entry.totalBytes,
      bytesPerSecond: entry.bytesPerSecond,
      attempts: entry.attempts,
      error: entry.error,
      verified: entry.verified,
    };
  }

  /** Emite um evento a todos os ouvintes. */
  private emit(entry: QueueEntry, type: 'state' | 'progress' = 'state'): void {
    const event: DownloadEvent = { type, task: this.toTask(entry) };
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** Liga o temporizador de progresso (chamado pelo primeiro `run`). */
  private ensureProgressTimer(): void {
    if (this.progressTimer === null) {
      this.progressTimer = setInterval(() => {
        void this.measureProgress();
      }, PROGRESS_INTERVAL_MS);
      // `unref` para que o temporizador nunca mantenha o processo vivo:
      // um ambiente de testes fecharia por causa de um contador.
      this.progressTimer.unref?.();
    }
  }
}

/** Reexporta a sonda de URL (usada pelos testes e pela interface). */
export { probe };