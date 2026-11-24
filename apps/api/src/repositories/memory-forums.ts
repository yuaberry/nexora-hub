import { randomUUID } from 'node:crypto';
import type {
  ForumPostRecord,
  ForumRepository,
  ForumThreadRecord,
  NewPostInput,
  NewThreadInput,
} from './types.js';

/**
 * Fóruns em memória — tópicos e respostas.
 *
 * A ordem da lista é pela **última actividade** (respondido sobe), e uma
 * resposta faz o tópico subir: a contagem e a data andam juntas, escritas
 * pela mesma operação.
 */
export class MemoryForumRepository implements ForumRepository {
  private readonly threads = new Map<string, ForumThreadRecord>();
  private readonly posts = new Map<string, ForumPostRecord>();

  async createThread(input: NewThreadInput): Promise<ForumThreadRecord> {
    const now = new Date();
    const record: ForumThreadRecord = {
      id: randomUUID(),
      gameId: input.gameId,
      authorId: input.authorId,
      title: input.title,
      body: input.body,
      replyCount: 0,
      locked: false,
      createdAt: now,
      lastActivityAt: now,
    };
    this.threads.set(record.id, record);
    return record;
  }

  async listThreads(gameId: string, limit: number, offset: number): Promise<readonly ForumThreadRecord[]> {
    return [...this.threads.values()]
      .filter((row) => row.gameId === gameId)
      .sort((left, right) => right.lastActivityAt.getTime() - left.lastActivityAt.getTime() || left.id.localeCompare(right.id))
      .slice(offset, offset + limit);
  }

  async findThread(threadId: string): Promise<ForumThreadRecord | null> {
    return this.threads.get(threadId) ?? null;
  }

  async createPost(input: NewPostInput): Promise<ForumPostRecord> {
    const record: ForumPostRecord = {
      id: randomUUID(),
      threadId: input.threadId,
      authorId: input.authorId,
      body: input.body,
      createdAt: new Date(),
    };
    this.posts.set(record.id, record);
    // A resposta faz o tópico subir: a data e a contagem andam juntas.
    const thread = this.threads.get(input.threadId);
    if (thread !== undefined) {
      this.threads.set(thread.id, {
        ...thread,
        replyCount: thread.replyCount + 1,
        lastActivityAt: record.createdAt,
      });
    }
    return record;
  }

  async listPosts(threadId: string, limit: number, offset: number): Promise<readonly ForumPostRecord[]> {
    return [...this.posts.values()]
      .filter((row) => row.threadId === threadId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async setLocked(threadId: string, authorId: string, locked: boolean): Promise<boolean> {
    const thread = this.threads.get(threadId);
    if (thread === undefined || thread.authorId !== authorId) {
      return false;
    }
    this.threads.set(threadId, { ...thread, locked });
    return true;
  }

  async deleteOwnedThread(threadId: string, authorId: string): Promise<boolean> {
    const thread = this.threads.get(threadId);
    if (thread === undefined || thread.authorId !== authorId) {
      return false;
    }
    this.threads.delete(threadId);
    for (const [id, post] of this.posts) {
      if (post.threadId === threadId) {
        this.posts.delete(id);
      }
    }
    return true;
  }

  async deleteOwnedPost(postId: string, authorId: string): Promise<boolean> {
    const post = this.posts.get(postId);
    if (post === undefined || post.authorId !== authorId) {
      return false;
    }
    this.posts.delete(postId);
    return true;
  }
}
