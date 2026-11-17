/**
 * Contrato do *gateway* de tempo real (Socket.IO).
 *
 * Nesta fase o gateway é só o **esqueleto**: o evento de conexão e o
 * envelope existem para que a web e o desktop os usem sem divergir, mas
 * nenhum evento de jogo é emitido — presença por heartbeat é tipo, não
 * implementação.
 */

/** Envelope de qualquer evento do gateway. */
export interface GatewayEvent<TPayload> {
  /** Nome do evento (`presence.update`, `session.progress`…). */
  readonly type: string;
  /** Carga do evento. */
  readonly payload: TPayload;
  /** ISO-8601 UTC da emissão. */
  readonly at: string;
  /** Utilizador a quem o evento se destina (`null` = difusão). */
  readonly userId: string | null;
}

/** Eventos que existem no contrato (mesmo sem serem emitidos ainda). */
export type GatewayEventType = 'connected' | 'presence.update' | 'session.progress';

/** Monta o envelope de um evento (usado pelos testes e pelo gateway). */
export function gatewayEvent<TPayload>(
  type: GatewayEventType,
  payload: TPayload,
  options: { at?: Date; userId?: string | null } = {},
): GatewayEvent<TPayload> {
  return {
    type,
    payload,
    at: (options.at ?? new Date()).toISOString(),
    userId: options.userId ?? null,
  };
}