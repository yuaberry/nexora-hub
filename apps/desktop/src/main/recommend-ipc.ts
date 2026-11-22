/**
 * IPC das recomendações — o algoritmo declarado, pela API.
 *
 * Canal fino: o renderer pede, o processo principal fala com a API com o token
 * da sessão quando a rota o exige. As recomendações pessoais lêem a
 * biblioteca da conta — e sem conta não há recomendações, a rota recusa.
 */

import { ipcMain } from 'electron';
import { DEFAULT_API_BASE_URL } from './config.js';
import type {
  RecommendationItemView,
  RecommendationsView,
} from '../shared/preload-api.js';

/** Resposta crua de uma chamada à API. */
type ApiPayload = Record<string, unknown> & { error?: { message?: string } };

/** Resultado de uma chamada à API. */
type ApiOutcome =
  | { readonly ok: true; readonly payload: ApiPayload }
  | { readonly ok: false; readonly message: string };

/**
 * Chamada autenticada à API, com o token da sessão do renderer.
 *
 * O token **nunca** é guardado: recebido, usado no cabeçalho, esquecido.
 */
async function apiCall(method: 'GET', path: string, token: string): Promise<ApiOutcome> {
  try {
    const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
      method,
      headers: { accept: 'application/json', authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    const payload = (text === '' ? {} : JSON.parse(text)) as ApiPayload;
    if (!response.ok) {
      return { ok: false, message: payload.error?.message ?? 'Pedido recusado.' };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, message: 'A API está inacessível.' };
  }
}

/** Converte os itens de uma resposta na vista do renderer. */
function itemsOf(payload: ApiPayload): readonly RecommendationItemView[] {
  const items = payload['items'];
  if (!Array.isArray(items)) {
    return [];
  }
  return (items as RecommendationItemView[]).map((item) => ({
    gameId: item.gameId,
    title: item.title,
    tagline: item.tagline,
    platforms: item.platforms ?? [],
    adult: item.adult ?? false,
    score: item.score ?? 0,
    sharedTags: item.sharedTags ?? [],
  }));
}

/** Regista os canais das recomendações. */
export function registerRecommendIpc(): void {
  // Parecidos com um jogo do directório (público).
  ipcMain.handle('recommend:similar', async (_event, gameId: unknown): Promise<RecommendationsView> => {
    if (typeof gameId !== 'string' || gameId === '') {
      return { ok: false, message: 'Jogo em falta.' };
    }
    const outcome = await apiCall('GET', `/api/v1/recommendations/similar/${encodeURIComponent(gameId)}`, '');
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true, items: itemsOf(outcome.payload) };
  });

  // Recomendado para si (exige conta).
  ipcMain.handle('recommend:forYou', async (_event, token: unknown): Promise<RecommendationsView> => {
    if (typeof token !== 'string' || token === '') {
      return { ok: false, message: 'Sessão obrigatória.' };
    }
    const outcome = await apiCall('GET', '/api/v1/recommendations/for-you', token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return {
      ok: true,
      items: itemsOf(outcome.payload),
      reason: typeof outcome.payload['reason'] === 'string' ? (outcome.payload['reason'] as string) : undefined,
    };
  });
}