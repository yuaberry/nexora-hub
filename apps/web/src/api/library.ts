import type {
  GameSearchHit,
  LibraryGame,
  LibraryPage,
  SessionPage,
} from '@nexora/protocol';
import { apiRequest } from './client.js';

/**
 * Clientes das rotas da API.
 *
 * A web é **leitura**: escreve apenas o que é do utilizador (login, registo,
 * favoritos). Nada aqui finge uma capacidade que não existe — os módulos
 * planeados não têm cliente.
 */

/** Regista uma conta e devolve o utilizador e os tokens. */
export function register(input: { email: string; password: string; displayName: string }) {
  return apiRequest<{ user: { id: string; email: string }; tokens: { accessToken: string; refreshToken: string } }>(
    '/api/v1/auth/register',
    { method: 'POST', body: input, auth: false },
  );
}

/** Entra com e-mail e senha. */
export function login(input: { email: string; password: string }) {
  return apiRequest<
    | { kind: 'authenticated'; user: { id: string }; tokens: { accessToken: string; refreshToken: string } }
    | { kind: 'mfa_required'; challenge: { challengeToken: string; expiresIn: number }; user: { id: string } }
  >('/api/v1/auth/login', { method: 'POST', body: input, auth: false });
}

/** Verifica o segundo factor. */
export function verifyMfa(input: { challengeToken: string; code: string }) {
  return apiRequest<{ user: { id: string }; tokens: { accessToken: string; refreshToken: string } }>(
    '/api/v1/auth/mfa/verify',
    { method: 'POST', body: input, auth: false },
  );
}

/** Utilizador autenticado. */
export function me() {
  return apiRequest<{
    user: {
      id: string;
      email: string;
      displayName: string;
      role: string;
      planId: string;
      mfaEnabled: boolean;
      createdAt: string;
    };
  }>('/api/v1/me');
}

/** Biblioteca do utilizador (leitura). */
export function library(limit = 50, offset = 0) {
  return apiRequest<LibraryPage>(`/api/v1/library?limit=${limit}&offset=${offset}`);
}

/** Pesquisa de jogos — o mesmo motor da barra do desktop. */
export function searchGames(query: string, limit = 20) {
  return apiRequest<{ items: GameSearchHit[] }>(
    `/api/v1/games/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

/** Sessões de jogo do utilizador (leitura). */
export function sessions(limit = 50, offset = 0) {
  return apiRequest<SessionPage>(`/api/v1/sessions?limit=${limit}&offset=${offset}`);
}

/** Marca (ou desmarca) um favorito. */
export function setFavorite(id: string, favorite: boolean) {
  return apiRequest<{ entry: LibraryGame }>(`/api/v1/library/${id}/favorite`, {
    method: 'PUT',
    body: { favorite },
  });
}

/** Resumo administrativo (esqueleto — a guarda é do servidor). */
export function adminOverview() {
  return apiRequest<{ overview: { users: number; auditEntries: number; mode: string } }>(
    '/api/v1/admin/overview',
  );
}
/**
 * A biblioteca sincronizada da conta.
 *
 * O launcher sobe o **metadado** (título, appid, favorito, tempo medido) e a
 * web mostra-o: a cápsula é reconstruída a partir do appid (a arte pública da
 * Steam), porque caminhos locais nunca sobem.
 */
export interface SyncedEntry {
  readonly externalKey: string;
  readonly title: string;
  readonly steamAppId: string | null;
  readonly coverUrl: string | null;
  readonly installed: boolean;
  readonly favorite: boolean;
  readonly totalSeconds: number;
  readonly updatedAt: string;
}

export function syncedLibrary() {
  return apiRequest<{ items: SyncedEntry[]; total: number }>('/api/v1/library/mine');
}
