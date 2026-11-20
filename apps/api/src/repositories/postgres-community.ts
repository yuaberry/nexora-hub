import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema.js';
import type {
  CommentRecord,
  CommentRepository,
  NewCommentInput,
  ReviewAggregate,
  ReviewRecord,
  ReviewRepository,
  UpsertReviewInput,
} from './types.js';

/**
 * Comunidade em PostgreSQL.
 *
 * **Recurso de outro utilizador devolve `404`, nunca `403`**: apagar filtra
 * sempre pelo dono, e uma linha alheia é indistinguível de uma inexistente. A
 * review é uma por utilizador e jogo — `onConflict` no índice único
 * `(game_id, user_id)` faz o *upsert* sem duplicar.
 */

const { comments, reviews } = schema;

type Db = NodePgDatabase<typeof schema>;

/** Comentários em PostgreSQL. */
export class PostgresCommentRepository implements CommentRepository {
  constructor(private readonly db: Db) {}

  async create(input: NewCommentInput): Promise<CommentRecord> {
    const rows = await this.db
      .insert(comments)
      .values({ gameId: input.gameId, userId: input.userId, body: input.body })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('O comentário não foi devolvido pelo banco.');
    }
    return toComment(row);
  }

  async listByGame(gameId: string, limit: number, offset: number): Promise<readonly CommentRecord[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(eq(comments.gameId, gameId))
      .orderBy(desc(comments.createdAt))
      .limit(limit)
      .offset(offset);
    return rows.map(toComment);
  }

  async listByUser(userId: string, limit: number): Promise<readonly CommentRecord[]> {
    const rows = await this.db
      .select()
      .from(comments)
      .where(eq(comments.userId, userId))
      .orderBy(desc(comments.createdAt))
      .limit(limit);
    return rows.map(toComment);
  }

  async deleteOwned(commentId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(comments)
      .where(and(eq(comments.id, commentId), eq(comments.userId, userId)))
      .returning({ id: comments.id });
    return rows.length > 0;
  }
}

/** Reviews em PostgreSQL (upsert por jogo/utilizador). */
export class PostgresReviewRepository implements ReviewRepository {
  constructor(private readonly db: Db) {}

  async upsert(input: UpsertReviewInput): Promise<ReviewRecord> {
    const rows = await this.db
      .insert(reviews)
      .values({
        gameId: input.gameId,
        userId: input.userId,
        rating: input.rating,
        story: input.story,
        gameplay: input.gameplay,
        graphics: input.graphics,
        sound: input.sound,
        body: input.body,
      })
      .onConflictDoUpdate({
        target: [reviews.gameId, reviews.userId],
        set: {
          rating: input.rating,
          story: input.story,
          gameplay: input.gameplay,
          graphics: input.graphics,
          sound: input.sound,
          body: input.body,
          updatedAt: new Date(),
        },
      })
      .returning();
    const row = rows[0];
    if (row === undefined) {
      throw new Error('A review não foi devolvida pelo banco.');
    }
    return toReview(row);
  }

  async listByGame(gameId: string, limit: number, offset: number): Promise<readonly ReviewRecord[]> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.gameId, gameId))
      .orderBy(desc(reviews.updatedAt))
      .limit(limit)
      .offset(offset);
    return rows.map(toReview);
  }

  async aggregate(gameId: string): Promise<ReviewAggregate> {
    const rows = await this.db.select().from(reviews).where(eq(reviews.gameId, gameId));
    return {
      count: rows.length,
      averageRating: mean(rows.map((row) => row.rating)),
      averageStory: meanOrNull(rows.map((row) => row.story)),
      averageGameplay: meanOrNull(rows.map((row) => row.gameplay)),
      averageGraphics: meanOrNull(rows.map((row) => row.graphics)),
      averageSound: meanOrNull(rows.map((row) => row.sound)),
    };
  }

  async listByUser(userId: string, limit: number): Promise<readonly ReviewRecord[]> {
    const rows = await this.db
      .select()
      .from(reviews)
      .where(eq(reviews.userId, userId))
      .orderBy(desc(reviews.updatedAt))
      .limit(limit);
    return rows.map(toReview);
  }

  async deleteOwned(reviewId: string, userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(reviews)
      .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)))
      .returning({ id: reviews.id });
    return rows.length > 0;
  }
}

/** Converte uma linha do Drizzle no registo do contrato. */
function toComment(row: typeof comments.$inferSelect): CommentRecord {
  return {
    id: String(row.id),
    gameId: row.gameId,
    userId: String(row.userId),
    body: row.body,
    createdAt: row.createdAt ?? new Date(),
  };
}

/** Converte uma linha do Drizzle no registo do contrato. */
function toReview(row: typeof reviews.$inferSelect): ReviewRecord {
  return {
    id: String(row.id),
    gameId: row.gameId,
    userId: String(row.userId),
    rating: row.rating,
    story: row.story ?? null,
    gameplay: row.gameplay ?? null,
    graphics: row.graphics ?? null,
    sound: row.sound ?? null,
    body: row.body ?? '',
    createdAt: row.createdAt ?? new Date(),
    updatedAt: row.updatedAt ?? new Date(),
  };
}

/** Média (0 quando vazia). */
function mean(values: readonly (number | null)[]): number {
  return meanOrNull(values) ?? 0;
}

/** Média ou `null` quando não há votos. */
function meanOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  const total = present.reduce((sum, value) => sum + value, 0);
  return Math.round((total / present.length) * 100) / 100;
}