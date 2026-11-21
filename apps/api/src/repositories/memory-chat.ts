import { randomUUID } from 'node:crypto';
import type {
  ChatMessageRecord,
  ChatRepository,
  ConversationRecord,
} from './types.js';

/**
 * Chat em memória — conversas directas e mensagens.
 *
 * O par de participantes é **normalizado** (o id menor primeiro): mandar
 * segunda mensagem à mesma pessoa continua na mesma conversa, e a lista
 * nunca mostra dois cartões para a mesma pessoa.
 */
export class MemoryChatRepository implements ChatRepository {
  private readonly conversations = new Map<string, ConversationRecord>();
  private readonly messages = new Map<string, ChatMessageRecord>();

  async openDirect(userId: string, otherId: string): Promise<ConversationRecord> {
    const [a, b] = userId < otherId ? [userId, otherId] : [otherId, userId];
    const existing = [...this.conversations.values()].find(
      (row) => row.userIdA === a && row.userIdB === b,
    );
    if (existing !== undefined) {
      return existing;
    }
    const now = new Date();
    const record: ConversationRecord = {
      id: randomUUID(),
      userIdA: a,
      userIdB: b,
      createdAt: now,
      lastMessageAt: null,
      lastMessageExcerpt: null,
    };
    this.conversations.set(record.id, record);
    return record;
  }

  async listForUser(userId: string): Promise<readonly ConversationRecord[]> {
    return [...this.conversations.values()]
      .filter((row) => row.userIdA === userId || row.userIdB === userId)
      .sort(
        (left, right) =>
          (right.lastMessageAt ?? right.createdAt).getTime() -
          (left.lastMessageAt ?? left.createdAt).getTime(),
      );
  }

  async findById(conversationId: string): Promise<ConversationRecord | null> {
    return this.conversations.get(conversationId) ?? null;
  }

  async listMessages(conversationId: string, limit: number): Promise<readonly ChatMessageRecord[]> {
    return [...this.messages.values()]
      .filter((row) => row.conversationId === conversationId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(-limit);
  }

  async addMessage(input: {
    conversationId: string;
    authorId: string;
    body: string;
    excerpt: string;
    now: Date;
  }): Promise<ChatMessageRecord> {
    const record: ChatMessageRecord = {
      id: randomUUID(),
      conversationId: input.conversationId,
      authorId: input.authorId,
      body: input.body,
      createdAt: input.now,
    };
    this.messages.set(record.id, record);
    // O excerto e a data ficam na conversa: a lista não precisa de ler as
    // mensagens para mostrar quem falou por último.
    const conversation = this.conversations.get(input.conversationId);
    if (conversation !== undefined) {
      this.conversations.set(conversation.id, {
        ...conversation,
        lastMessageAt: input.now,
        lastMessageExcerpt: input.excerpt,
      });
    }
    return record;
  }
}