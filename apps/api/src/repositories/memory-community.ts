import { randomUUID } from 'node:crypto';
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
 * Comunidade em memória — comentários e reviews.
 *
 * Uma review é **uma por utilizador e jogo**: actualizar substitui. O
 * agregado é calculado a ler (médias e contagem) — nada é pré-calculado, para
 * não haver número velho a aparecer como verdadeiro.
 */
export class MemoryCommentRepository implements CommentRepository {
  private readonly rows = new Map<string, CommentRecord>();

  async create(input: NewCommentInput): Promise<CommentRecord> {
    const record: CommentRecord = {
      id: randomUUID(),
      gameId: input.gameId,
      userId: input.userId,
      body: input.body,
      createdAt: new Date(),
    };
    this.rows.set(record.id, record);
    return record;
  }

  async listByGame(gameId: string, limit: number, offset: number): Promise<readonly CommentRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.gameId === gameId)
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(offset, offset + limit);
  }

  async deleteOwned(commentId: string, userId: string): Promise<boolean> {
    const row = this.rows.get(commentId);
    // Um comentário de outro utilizador é indistinguível de um inexistente.
    if (row === undefined || row.userId !== userId) {
      return false;
    }
    this.rows.delete(commentId);
    return true;
  }
}

/** Reviews em memória (upsert pelo par jogo/utilizador). */
export class MemoryReviewRepository implements ReviewRepository {
  private readonly rows = new Map<string, ReviewRecord>();

  async upsert(input: UpsertReviewInput): Promise<ReviewRecord> {
    const existing = [...this.rows.values()].find(
      (row) => row.gameId === input.gameId && row.userId === input.userId,
    );
    const now = new Date();

    if (existing !== undefined) {
      const updated: ReviewRecord = {
        ...existing,
        rating: input.rating,
        story: input.story,
        gameplay: input.gameplay,
        graphics: input.graphics,
        sound: input.sound,
        body: input.body,
        updatedAt: now,
      };
      this.rows.set(updated.id, updated);
      return updated;
    }

    const record: ReviewRecord = {
      id: randomUUID(),
      gameId: input.gameId,
      userId: input.userId,
      rating: input.rating,
      story: input.story,
      gameplay: input.gameplay,
      graphics: input.graphics,
      sound: input.sound,
      body: input.body,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async listByGame(gameId: string, limit: number, offset: number): Promise<readonly ReviewRecord[]> {
    return [...this.rows.values()]
      .filter((row) => row.gameId === gameId)
      .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
      .slice(offset, offset + limit);
  }

  async aggregate(gameId: string): Promise<ReviewAggregate> {
    const rows = [...this.rows.values()].filter((row) => row.gameId === gameId);
    return {
      count: rows.length,
      averageRating: mean(rows.map((row) => row.rating)),
      // `null` quando ninguém votou na categoria: uma média de 0 seria uma
      // mentira com cara de número.
      averageStory: meanOrNull(rows.map((row) => row.story)),
      averageGameplay: meanOrNull(rows.map((row) => row.gameplay)),
      averageGraphics: meanOrNull(rows.map((row) => row.graphics)),
      averageSound: meanOrNull(rows.map((row) => row.sound)),
    };
  }

  async deleteOwned(reviewId: string, userId: string): Promise<boolean> {
    const row = this.rows.get(reviewId);
    if (row === undefined || row.userId !== userId) {
      return false;
    }
    this.rows.delete(reviewId);
    return true;
  }
}

/** Média de uma lista de valores (ignora `null`; 0 quando não há valores). */
function mean(values: readonly (number | null)[]): number {
  const result = meanOrNull(values);
  return result ?? 0;
}

/** Média ou `null` quando não há nenhum valor presente. */
function meanOrNull(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  const total = present.reduce((sum, value) => sum + value, 0);
  return Math.round((total / present.length) * 100) / 100;
}