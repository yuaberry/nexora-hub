import type { UserRecord } from '../../repositories/types.js';
import type { PublicUser } from '@nexora/protocol';

/**
 * Fronteira do utilizador.
 *
 * A rota devolve `PublicUser`, **nunca** a linha da base de dados — que traz
 * `passwordHash` e `passwordSalt`. A fronteira é imposta pelo tipo: não há
 * caminho de código que devolva o registo interno.
 */
export function toPublicUser(user: UserRecord, mfaEnabled: boolean): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    planId: user.planId,
    mfaEnabled,
    createdAt: user.createdAt.toISOString(),
  };
}