import { randomUUID } from 'node:crypto';
import type {
  FriendRequestRecord,
  FriendshipRecord,
  FriendsRepository,
  NewFriendRequestInput,
  PresenceRecord,
  PresenceRepository,
} from './types.js';

/**
 * Amizades e presença em memória.
 *
 * As mesmas regras do PostgreSQL, aplicadas aqui: um pedido pendente entre
 * duas pessoas só existe uma vez (em qualquer direcção), e uma amizade vive
 * nos dois sentidos. A presença tem validade — o que expirou é lixo, e a
 * leitura não o devolve.
 */
export class MemoryFriendsRepository implements FriendsRepository {
  private readonly requests = new Map<string, FriendRequestRecord>();
  private readonly links = new Map<string, FriendshipRecord>();

  async listFriends(userId: string): Promise<readonly FriendshipRecord[]> {
    return [...this.links.values()]
      .filter((row) => row.userId === userId)
      .sort((left, right) => right.since.getTime() - left.since.getTime());
  }

  async listIncomingRequests(userId: string): Promise<readonly FriendRequestRecord[]> {
    return [...this.requests.values()]
      .filter((row) => row.toUserId === userId && row.status === 'pending')
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async listOutgoingRequests(userId: string): Promise<readonly FriendRequestRecord[]> {
    return [...this.requests.values()]
      .filter((row) => row.fromUserId === userId && row.status === 'pending')
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  }

  async createRequest(input: NewFriendRequestInput): Promise<FriendRequestRecord | null> {
    // Um pendente entre os dois — em qualquer direcção — impede outro.
    const exists = [...this.requests.values()].some(
      (row) =>
        row.status === 'pending' &&
        ((row.fromUserId === input.fromUserId && row.toUserId === input.toUserId) ||
          (row.fromUserId === input.toUserId && row.toUserId === input.fromUserId)),
    );
    if (exists) {
      return null;
    }
    const record: FriendRequestRecord = {
      id: input.id,
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      status: 'pending',
      createdAt: new Date(),
      respondedAt: null,
    };
    this.requests.set(record.id, record);
    return record;
  }

  async respondRequest(
    requestId: string,
    status: 'accepted' | 'declined' | 'cancelled',
    now: Date,
  ): Promise<FriendRequestRecord | null> {
    const row = this.requests.get(requestId);
    if (row === undefined || row.status !== 'pending') {
      return null;
    }
    const updated: FriendRequestRecord = { ...row, status, respondedAt: now };
    this.requests.set(requestId, updated);
    return updated;
  }

  async addFriendship(userId: string, friendId: string, now: Date): Promise<void> {
    this.links.set(linkKey(userId, friendId), { userId, friendId, since: now });
  }

  async removeFriendship(userId: string, friendId: string): Promise<boolean> {
    return this.links.delete(linkKey(userId, friendId));
  }
}

/** Presença em memória — um coração por utilizador, com validade. */
export class MemoryPresenceRepository implements PresenceRepository {
  private readonly rows = new Map<string, PresenceRecord>();

  async heartbeat(input: { userId: string; gameId: string | null; at: Date; expiresAt: Date }): Promise<void> {
    this.rows.set(input.userId, {
      userId: input.userId,
      gameId: input.gameId,
      at: input.at,
      expiresAt: input.expiresAt,
    });
  }

  async list(userIds: readonly string[]): Promise<readonly PresenceRecord[]> {
    const ids = new Set(userIds);
    return [...this.rows.values()].filter((row) => ids.has(row.userId));
  }

  async prune(before: Date): Promise<number> {
    let removed = 0;
    for (const row of [...this.rows.values()]) {
      if (row.expiresAt.getTime() < before.getTime()) {
        this.rows.delete(row.userId);
        removed += 1;
      }
    }
    return removed;
  }
}

/** Chave de uma amizade (utilizador + amigo). */
function linkKey(userId: string, friendId: string): string {
  return `${userId}:${friendId}`;
}

/** Identificador de pedido (reexportado para os testes). */
export { randomUUID };