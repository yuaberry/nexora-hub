/**
 * Tipos do motor de downloads do NEXORA HUB.
 *
 * O motor é **neutro**: transfere ficheiros de URLs declaradas num manifesto
 * instalado pelo utilizador. A NEXORA não hospeda nem redistribui conteúdo —
 * estes tipos não sabem (e não devem saber) de onde os ficheiros vêm.
 */

/** Estado de uma tarefa de download. */
export type DownloadState =
  | 'queued'
  | 'downloading'
  | 'paused'
  | 'verifying'
  | 'completed'
  | 'failed';

/** Algoritmo de verificação suportado. */
export interface Checksum {
  readonly algorithm: 'sha256';
  /** Hex minúsculo, sem prefixo. */
  readonly value: string;
}

/** Pedido de download por HTTP (multi-conexão, com retoma). */
export interface HttpDownloadRequest {
  /** Identificador da tarefa (estável, do manifesto ou do operador). */
  readonly taskId: string;
  /** Jogo a que pertence (liga à biblioteca). */
  readonly gameId: string;
  /** URL do ficheiro. */
  readonly url: string;
  /** Caminho final do ficheiro (pasta do utilizador). */
  readonly destinationPath: string;
  /** Checksum esperado — a verificação é obrigatória quando declarada. */
  readonly checksum?: Checksum;
  /** Número de conexões paralelas (1–16; omissão 8). */
  readonly connections?: number;
  /** Prioridade na fila (maior primeiro; omissão 0). */
  readonly priority?: number;
}

/** Estado observável de uma tarefa. */
export interface DownloadTask {
  readonly taskId: string;
  readonly gameId: string;
  readonly url: string;
  readonly destinationPath: string;
  readonly state: DownloadState;
  /** Bytes já recebidos (soma das partes completas mais a parcial). */
  readonly receivedBytes: number;
  /** Total declarado pelo servidor, ou `null` se desconhecido. */
  readonly totalBytes: number | null;
  /** Velocidade medida, bytes/segundo (0 quando parado). */
  readonly bytesPerSecond: number;
  /** Número de tentativas (retoma conta). */
  readonly attempts: number;
  /** Motivo da falha, quando `state === 'failed'`. */
  readonly error: string | null;
  /** `true` quando o checksum foi verificado com sucesso. */
  readonly verified: boolean;
}

/** Evento de progresso/estado emitido pela fila. */
export interface DownloadEvent {
  readonly type: 'state' | 'progress';
  readonly task: DownloadTask;
}

/** Resultado de verificar espaço antes de iniciar. */
export interface SpaceCheck {
  readonly ok: boolean;
  /** Bytes livres no volume do destino. */
  readonly freeBytes: number;
  /** Bytes que a tarefa precisa (declarado pelo servidor). */
  readonly neededBytes: number | null;
  /** Motivo da recusa, quando `ok === false`. */
  readonly reason: string | null;
}