import { and, asc, desc, eq, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { chatMessages, conversations } from '../db/chat-schema.js';
import type {
  ChatMessageRecord,
  ChatRepository,
  ConversationRecord,
} from './types.js';

/**
 * Chat em PostgreSQL.
 *
 * O que a memória não dá conta: o índice único do par impede duas conversas
 * para as mesmas duas pessoas — e o `onConflictDoNothing` torna a abertura
 * idempotente sem precisar de uma leitura antes (dois pedidos em paralelo
 * dão uma conversa, não duas).
 */
export class PostgresChatRepository implements ChatRepository {
  constructor(private readonly db: NodePgDatabase<Record<string, unknown>>) {}

  async openDirect(userId: string, otherId: string): Promise<ConversationRecord> {
    const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
    await this.db
      .insert(conversations)
      .values({ userIdA: a, userIdB: b })
      .onConflictDoNothing();
    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(eq(conversations.userIdA, a), eq(conversations.userIdB, b)))
      .limit(1);
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Falha ao abrir a conversa.');
    }
    return toConversation(row);
  }

  async listForUser(userId: string): Promise<readonly ConversationRecord[]> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(or(eq(conversations.userIdA, userId), eq(conversations.userIdB, userId)))
      .orderBy(desc(conversations.lastMessageAt), desc(conversations.createdAt));
    return rows.map(toConversation);
  }

  async findById(conversationId: string): Promise<ConversationRecord | null> {
    const rows = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const row = rows[0];
    return row === undefined ? null : toConversation(row);
  }

  async listMessages(conversationId: string, limit: number): Promise<readonly ChatMessageRecord[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversationId))
      .orderBy(asc(chatMessages.createdAt));
    return rows.slice(-limit).map(toMessage);
  }

  async addMessage(input: {
    conversationId: string;
    authorId: string;
    body: string;
    excerpt: string;
    now: Date;
  }): Promise<ChatMessageRecord> {
    const rows = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(chatMessages)
        .values({
          conversationId: input.conversationId,
          authorId: input.authorId,
          body: input.body,
          createdAt: input.now,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) {
        throw new Error('Falha ao gravar a mensagem.');
      }
      await tx
        .update(conversations)
        .set({ lastMessageAt: input.now, lastMessageExcerpt: input.excerpt })
        .where(eq(conversations.id, input.conversationId));
      return row;
    });
    return toMessage(rows);
  }
}

/** Converte uma linha de conversa no registo do domínio. */
function toConversation(row: typeof conversations.$inferSelect): ConversationRecord {
  return {
    id: row.id,
    userIdA: row.userIdA,
    userIdB: row.userIdB,
    createdAt: row.createdAt ?? new Date(),
    lastMessageAt: row.lastMessageAt ?? null,
    lastMessageExcerpt: row.lastMessageExcerpt ?? null,
  };
}

/** Converte uma linha de mensagem no registo do domínio. */
function toMessage(row: typeof chatMessages.$inferSelect): ChatMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt ?? new Date(),
  };
}