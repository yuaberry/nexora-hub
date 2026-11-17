/**
 * Contratos **planeados** — só tipos nesta fase.
 *
 * Tudo o que ainda não existe vive aqui com `availability: 'planned'` e um
 * motivo. A regra de honestidade é simples: a interface nunca mostra um botão
 * que finja funcionar; mostra o selo "Planeado" e o que falta. Este ficheiro
 * é o contrato dessas peças — nenhuma rota o serve ainda.
 */

/** Estado de disponibilidade de uma capacidade. */
export type PlannedStatus = 'planned' | 'unavailable';

/** Declaração de disponibilidade (sempre explícita). */
export interface Availability {
  readonly status: PlannedStatus;
  /** Chave de tradução do motivo (`planned.<chave>`). */
  readonly reasonKey: string;
  /** Texto do motivo no idioma do servidor (pt-BR). */
  readonly reason: string;
}

/** Presença e actividade do amigo (Fase 2 — só heartbeat e tipos). */
export interface PresenceHeartbeat {
  readonly userId: string;
  /** Última actividade declarada pelo cliente, ISO-8601 UTC. */
  readonly lastSeenAt: string;
  /** Jogo em curso, quando o cliente declara um. */
  readonly playingGameId: string | null;
}

/** Motor de downloads — interface do motor, sem implementação nesta fase. */
export interface DownloadTask {
  readonly taskId: string;
  readonly gameId: string;
  /** Percentagem concluída (0–100); `null` enquanto indeterminado. */
  readonly progress: number | null;
}

/** Saves na nuvem — cliente dedicado ao Nexora Cloud (Fase 2+). */
export interface CloudSaveSlot {
  readonly gameId: string;
  readonly slot: string;
  readonly updatedAt: string;
  readonly sizeBytes: number;
}

/** Estado do save na nuvem devolvido pelo cliente. */
export interface CloudSavesStatus extends Availability {
  /** `false` nesta fase: o cliente Cloud é um *stub*. */
  readonly available: false;
}

/** Overlay, FPS, loja, amigos, Remote Play — todos planeados. */
export const PLANNED_MODULES = [
  'downloads',
  'cloud-saves',
  'overlay',
  'fps-counter',
  'store',
  'friends',
  'presence',
  'remote-play',
  'mods',
  'achievements',
  'points',
  'os-optimizer',
  'controller',
  'captures',
  'clans',
  'chat',
] as const;

export type PlannedModule = (typeof PLANNED_MODULES)[number];

/** Razões declaradas, uma por módulo planeado. */
export const PLANNED_REASONS: Readonly<Record<PlannedModule, string>> = {
  downloads: 'Motor de downloads: só a interface existe nesta fase.',
  'cloud-saves': 'Saves na nuvem: integração com o Nexora Cloud é fase futura.',
  overlay: 'Overlay: não implementado nesta fase.',
  'fps-counter': 'Contador de FPS: não implementado nesta fase.',
  store: 'Loja: a NEXORA não vende nem redistribui jogos nesta fase.',
  friends: 'Amigos: fase futura.',
  presence: 'Presença por heartbeat: só os tipos existem nesta fase.',
  'remote-play': 'Remote Play: fase futura.',
  mods: 'Mods: fase futura.',
  achievements: 'Conquistas: fase futura.',
  points: 'Pontos: fase futura.',
  'os-optimizer': 'Optimização de sistema: nunca será feita por drivers ou componentes privilegiados.',
  controller: 'Controles: fase futura.',
  captures: 'Capturas de ecrã: fase futura.',
  clans: 'Clãs: fase futura.',
  chat: 'Chat: fase futura.',
};

/** Disponibilidade declarada de um módulo planeado. */
export function plannedAvailability(module: PlannedModule): Availability {
  return { status: 'planned', reasonKey: module, reason: PLANNED_REASONS[module] };
}