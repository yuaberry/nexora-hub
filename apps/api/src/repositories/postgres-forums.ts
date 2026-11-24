import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type {
  ForumPostRecord,
  ForumRepository,
  ForumThreadRecord,
  NewPostInput,
  NewThreadInput,
} from './types.js';

/**
 * Fóruns em PostgreSQL.
 *
 * **Recurso de outro utilizador devolve `404`, nunca `403`**: fechar e apagar
 * filtram sempre pelo autor, e uma linha alheia é indistinguível de uma
 * inexistente. A resposta faz o tópico subir numa única instrução
 * (`reply_count + 1` + `last_activity_at`), para a lista nunca mostrar uma
 * contagem que não bate com as respostas.
 */

const { posts, threads } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Converte uma linha do banco no registo do domínio. */
function toThread(row: typeof threads.$inferSelect): ForumThreadRecord {
  return {
    id: row.id,
    gameId: row.gameId,
    authorId: row.authorId,
    title: row.title,
    body: row.body,
    replyCount: row.replyCount,
    locked: row.locked,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
  };
}

/** Converte uma linha do banco no registo do domínio. */
function toPost(row: typeof posts.$inferSelect): ForumPostRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt,
  };
}

/** Fóruns em PostgreSQL. */
export class PostgresForumRepository implements ForumRepository {
  constructor(private readonly db: Db) {}

  async createThread(input: NewThreadInput): Promise<ForumThreadRecord> {
    const rows = await this.db
      .insert(threads)
      .values({
        gameId: input.gameId,
        authorId: input.authorId,
        title: input.title,
        body: input.body,
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('O tópico não foi devolvido pelo banco.');
    }
    return toThread(row);
  }

  async listThreads(gameId: string, limit: number, offset: number): Promise<readonly ForumThreadRecord[]> {
    const rows = await this.db
      .select()
      .from(threads)
      .where(eq(threads.gameId, gameId))
      .orderBy(desc(threads.lastActivityAt), asc(threads.id))
      .limit(limit)
      .offset(offset);
    return rows.map(toThread);
  }

  async findThread(threadId: string): Promise<ForumThreadRecord | null> {
    const rows = await this.db.select().from(threads).where(eq(threads.id, threadId)).limit(1);
    const row = rows[0];
    return row === undefined ? null : toThread(row);
  }

  async createPost(input: NewPostInput): Promise<ForumPostRecord> {
    const rows = await this.db
      .insert(posts)
      .values({ threadId: input.threadId, authorId: input.authorId, body: input.body })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('A resposta não foi devolvida pelo banco.');
    }
    // A resposta faz o tópico subir: a contagem e a data andam juntas.
    await this.db
      .update(threads)
      .set({ replyCount: sql`${threads.replyCount} + 1`, lastActivityAt: row.createdAt })
      .where(eq(threads.id, input.threadId));
    return toPost(row);
  }

  async listPosts(threadId: string, limit: number, offset: number): Promise<readonly ForumPostRecord[]> {
    const rows = await this.db
      .select()
      .from(posts)
      .where(eq(posts.threadId, threadId))
      .orderBy(asc(posts.createdAt), asc(posts.id))
      .limit(limit)
      .offset(offset);
    return rows.map(toPost);
  }

  async setLocked(threadId: string, authorId: string, locked: boolean): Promise<boolean> {
    const rows = await this.db
      .update(threads)
      .set({ locked })
      .where(and(eq(threads.id, threadId), eq(threads.authorId, authorId)))
      .returning({ id: threads.id });
    return rows.length > 0;
  }

  async deleteOwnedThread(threadId: string, authorId: string): Promise<boolean> {
    const removed = await this.db
      .delete(threads)
      .where(and(eq(threads.id, threadId), eq(threads.authorId, authorId)))
      .returning({ id: threads.id });
    if (removed.length === 0) {
      return false;
    }
    await this.db.delete(posts).where(eq(posts.threadId, threadId));
    return true;
  }

  async deleteOwnedPost(postId: string, authorId: string): Promise<boolean> {
    const removed = await this.db
      .delete(posts)
      .where(and(eq(posts.id, postId), eq(posts.authorId, authorId)))
      .returning({ id: posts.id });
    return removed.length > 0;
  }
}