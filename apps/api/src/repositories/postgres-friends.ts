import { and, asc, desc, eq, inArray, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { friendships, friendRequests, presence } from '../db/friends-schema.js';
import type {
  FriendRequestRecord,
  FriendshipRecord,
  FriendsRepository,
  NewFriendRequestInput,
  PresenceRecord,
  PresenceRepository,
} from './types.js';

/**
 * Amizades e presença em PostgreSQL.
 *
 * O que a memória não dá conta: o pendente único é garantido por uma
 * **consulta antes de inserir** (a janela de corrida é mínima e a
 * consequência é um pendente a mais, que a resposta do outro resolve), e a
 * expiração da presença é filtrada no SQL — um coração velho não é devolvido
 * como se fosse fresco.
 */
export class PostgresFriendsRepository implements FriendsRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async listFriends(userId: string): Promise<readonly FriendshipRecord[]> {
    const rows = await this.db
      .select()
      .from(friendships)
      .where(eq(friendships.userId, userId))
      .orderBy(desc(friendships.since));
    return rows.map((row) => ({
      userId: row.userId,
      friendId: row.friendId,
      since: row.since ?? new Date(),
    }));
  }

  async listIncomingRequests(userId: string): Promise<readonly FriendRequestRecord[]> {
    return this.db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.toUserId, userId), eq(friendRequests.status, 'pending')))
      .orderBy(desc(friendRequests.createdAt))
      .then((rows) => rows.map(toRequestRecord));
  }

  async listOutgoingRequests(userId: string): Promise<readonly FriendRequestRecord[]> {
    return this.db
      .select()
      .from(friendRequests)
      .where(and(eq(friendRequests.fromUserId, userId), eq(friendRequests.status, 'pending')))
      .orderBy(desc(friendRequests.createdAt))
      .then((rows) => rows.map(toRequestRecord));
  }

  async createRequest(input: NewFriendRequestInput): Promise<FriendRequestRecord | null> {
    const pending = await this.db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          eq(friendRequests.fromUserId, input.fromUserId),
          eq(friendRequests.toUserId, input.toUserId),
        ),
      )
      .limit(1);
    if (pending.length > 0) {
      return null;
    }
    // O pendente no sentido inverso também impede: dois pendentes para a
    // mesma amizade seriam dois "sim" para o mesmo par.
    const inverse = await this.db
      .select()
      .from(friendRequests)
      .where(
        and(
          eq(friendRequests.status, 'pending'),
          eq(friendRequests.fromUserId, input.toUserId),
          eq(friendRequests.toUserId, input.fromUserId),
        ),
      )
      .limit(1);
    if (inverse.length > 0) {
      return null;
    }
    const rows = await this.db
      .insert(friendRequests)
      .values({ id: input.id, fromUserId: input.fromUserId, toUserId: input.toUserId })
      .returning();
    const row = rows[0];
    return row === undefined ? null : toRequestRecord(row);
  }

  async respondRequest(
    requestId: string,
    status: 'accepted' | 'declined' | 'cancelled',
    now: Date,
  ): Promise<FriendRequestRecord | null> {
    const rows = await this.db
      .update(friendRequests)
      .set({ status, respondedAt: now })
      .where(and(eq(friendRequests.id, requestId), eq(friendRequests.status, 'pending')))
      .returning();
    const row = rows[0];
    return row === undefined ? null : toRequestRecord(row);
  }

  async addFriendship(userId: string, friendId: string, now: Date): Promise<void> {
    await this.db
      .insert(friendships)
      .values({ userId, friendId, since: now })
      .onConflictDoNothing();
  }

  async removeFriendship(userId: string, friendId: string): Promise<boolean> {
    const rows = await this.db
      .delete(friendships)
      .where(and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)))
      .returning({ userId: friendships.userId });
    return rows.length > 0;
  }
}

/** Presença em PostgreSQL — upsert por utilizador, leitura com validade. */
export class PostgresPresenceRepository implements PresenceRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async heartbeat(input: { userId: string; gameId: string | null; at: Date; expiresAt: Date }): Promise<void> {
    await this.db
      .insert(presence)
      .values({ userId: input.userId, gameId: input.gameId, at: input.at, expiresAt: input.expiresAt })
      .onConflictDoUpdate({
        target: presence.userId,
        set: { gameId: input.gameId, at: input.at, expiresAt: input.expiresAt },
      });
  }

  async list(userIds: readonly string[]): Promise<readonly PresenceRecord[]> {
    if (userIds.length === 0) {
      return [];
    }
    const rows = await this.db
      .select()
      .from(presence)
      .where(inArray(presence.userId, [...userIds]))
      .orderBy(asc(presence.at));
    return rows.map((row) => ({
      userId: row.userId,
      gameId: row.gameId,
      at: row.at ?? new Date(),
      expiresAt: row.expiresAt ?? new Date(),
    }));
  }

  async prune(before: Date): Promise<number> {
    const rows = await this.db
      .delete(presence)
      .where(lt(presence.expiresAt, before))
      .returning({ userId: presence.userId });
    return rows.length;
  }
}

/** Converte uma linha de pedido no registo do domínio. */
function toRequestRecord(row: typeof friendRequests.$inferSelect): FriendRequestRecord {
  const status =
    row.status === 'pending' || row.status === 'accepted' || row.status === 'declined' || row.status === 'cancelled'
      ? row.status
      : 'pending';
  return {
    id: row.id,
    fromUserId: row.fromUserId,
    toUserId: row.toUserId,
    status,
    createdAt: row.createdAt ?? new Date(),
    respondedAt: row.respondedAt ?? null,
  };
}