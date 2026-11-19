import { apiRequest } from './client.js';

/**
 * Clientes da comunidade — comentários e reviews.
 *
 * A web é onde as contas existem: comentar e reviewar exigem sessão. Apagar
 * filtra pelo dono — um recurso de outro utilizador devolve `404` (a API não
 * confirma existência), e o cliente trata-o como "não encontrado".
 */

/** Um comentário. */
export interface Comment {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly body: string;
  readonly createdAt: string;
}

/** Uma review (a do próprio utilizador vem marcada). */
export interface Review {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly rating: number;
  readonly story: number | null;
  readonly gameplay: number | null;
  readonly graphics: number | null;
  readonly sound: number | null;
  readonly body: string;
  readonly updatedAt: string;
}

/** Agregado de reviews de um jogo. */
export interface ReviewAggregate {
  readonly count: number;
  readonly averageRating: number;
  readonly averageStory: number | null;
  readonly averageGameplay: number | null;
  readonly averageGraphics: number | null;
  readonly averageSound: number | null;
}

/** Lista os comentários de um jogo. */
export function comments(gameId: string) {
  return apiRequest<{ items: Comment[] }>(`/api/v1/games/${gameId}/comments`);
}

/** Cria um comentário (exige sessão). */
export function createComment(gameId: string, body: string) {
  return apiRequest<Comment>(`/api/v1/games/${gameId}/comments`, { method: 'POST', body: { body } });
}

/** Apaga um comentário próprio. */
export function deleteComment(commentId: string) {
  return apiRequest<null>(`/api/v1/comments/${commentId}`, { method: 'DELETE' });
}

/** Lista as reviews de um jogo, com o agregado. */
export function reviews(gameId: string) {
  return apiRequest<{ items: Review[]; aggregate: ReviewAggregate }>(`/api/v1/games/${gameId}/reviews`);
}

/** Cria ou substitui a review do utilizador (exige sessão). */
export function upsertReview(
  gameId: string,
  input: {
    rating: number;
    story?: number | null;
    gameplay?: number | null;
    graphics?: number | null;
    sound?: number | null;
    body?: string;
  },
) {
  return apiRequest<Review>(`/api/v1/games/${gameId}/reviews/me`, { method: 'PUT', body: input });
}

/** Apaga a review do utilizador. */
export function deleteReview(reviewId: string) {
  return apiRequest<null>(`/api/v1/reviews/${reviewId}`, { method: 'DELETE' });
}