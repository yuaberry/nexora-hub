import type { AuditAction } from '../db/types.js';
import type { AuditRepository } from '../repositories/types.js';

/**
 * Auditoria — **escritas**, nunca leituras.
 *
 * Uma escrita auditada carrega autor, acção, entidade e `requestId`: quem
 * alterou o quê, e com que pedido. Falhar a auditoria **não** derruba a
 * operação: a escrita é a verdade do sistema, e a trilha é o registo dela —
 * mas a falha fica no log, para não desaparecer em silêncio.
 */

export interface AuditInput {
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly entity: string;
  readonly entityId?: string | null;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly requestId?: string;
}

/** Regista uma escrita na trilha de auditoria. */
export async function audit(
  repository: AuditRepository,
  input: AuditInput,
): Promise<void> {
  try {
    await repository.record({
      actorId: input.actorId,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      metadata: { ...(input.metadata ?? {}) },
      requestId: input.requestId,
    });
  } catch {
    // A falha da trilha não desfaz a escrita — mas fica no log do servidor.
    console.error('[auditoria] falha ao registar', input.action);
  }
}