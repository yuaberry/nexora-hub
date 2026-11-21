/**
 * IPC social — amigos e presença.
 *
 * O mesmo desenho dos outros canais: o token vem do renderer, é
 * reencaminhado à API e esquecido. As regras (quem pode aceitar, o que a
 * presença mostra) são do servidor — aqui só passa o pedido e a resposta.
 */

import { ipcMain } from 'electron';
import { DEFAULT_API_BASE_URL } from './config.js';
import type {
  FriendsListView,
  PresenceView,
  SocialWriteResult,
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
async function apiCall(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  token: unknown,
  body?: Record<string, unknown>,
): Promise<ApiOutcome> {
  if (typeof token !== 'string' || token === '') {
    return { ok: false, message: 'Sessão obrigatória.' };
  }
  try {
    const response = await fetch(`${DEFAULT_API_BASE_URL}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

/**
 * Intervalo entre heartbeats, em milissegundos.
 *
 * Menor que a validade (45 s): um coração que falha uma vez ainda deixa o
 * utilizador online no próximo.
 */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Bate o coração da presença enquanto uma sessão de jogo dura.
 *
 * Bate imediatamente (o amigo vê "a jogar X" sem esperar), repete a cada
 * 30 s enquanto o jogo corre, e no fim bate com `null` — quem estava a ver
 * vê o amigo perder o jogo, não a pessoa desaparecer sem explicação.
 *
 * O token chega do renderer no lançamento e vive só dentro da sessão: sem
 * conta, não há presença (é honesto — a presença é da conta).
 */
export function startSessionPresence(token: string, gameId: string, sessionEnd: Promise<unknown>): void {
  const beat = (current: string | null): Promise<void> =>
    apiCall('POST', '/api/v1/presence/heartbeat', token, { gameId: current }).then(() => undefined);
  void beat(gameId);
  const timer = setInterval(() => {
    void beat(gameId);
  }, HEARTBEAT_INTERVAL_MS);
  void sessionEnd.then(() => {
    clearInterval(timer);
    void beat(null);
  });
}

/** Regista os canais sociais. */
export function registerFriendsIpc(): void {
  ipcMain.handle('friends:list', async (_event, token: unknown): Promise<FriendsListView> => {
    const outcome = await apiCall('GET', '/api/v1/friends', token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    const payload = outcome.payload;
    return {
      ok: true,
      friends: (payload['friends'] as FriendsListView['friends']) ?? [],
      incoming: (payload['incoming'] as FriendsListView['incoming']) ?? [],
      outgoing: (payload['outgoing'] as FriendsListView['outgoing']) ?? [],
    };
  });

  ipcMain.handle('friends:request', async (_event, email: unknown, token: unknown): Promise<SocialWriteResult> => {
    if (typeof email !== 'string' || !email.includes('@')) {
      return { ok: false, message: 'Email inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/friends', token, { email: email.trim() });
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true, userId: typeof outcome.payload['to'] === 'string' ? (outcome.payload['to'] as string) : undefined };
  });

  ipcMain.handle(
    'friends:respond',
    async (_event, requestId: unknown, action: unknown, token: unknown): Promise<SocialWriteResult> => {
      if (typeof requestId !== 'string' || requestId === '') {
        return { ok: false, message: 'Pedido inválido.' };
      }
      if (action !== 'accept' && action !== 'decline' && action !== 'cancel') {
        return { ok: false, message: 'Acção inválida.' };
      }
      const outcome = await apiCall('POST', `/api/v1/friends/requests/${encodeURIComponent(requestId)}/${action}`, token);
      if (!outcome.ok) {
        return { ok: false, message: outcome.message };
      }
      return {
        ok: true,
        status: typeof outcome.payload['status'] === 'string' ? (outcome.payload['status'] as string) : undefined,
        userId: typeof outcome.payload['friendId'] === 'string' ? (outcome.payload['friendId'] as string) : undefined,
      };
    },
  );

  ipcMain.handle('friends:remove', async (_event, userId: unknown, token: unknown): Promise<SocialWriteResult> => {
    if (typeof userId !== 'string' || userId === '') {
      return { ok: false, message: 'Amigo inválido.' };
    }
    const outcome = await apiCall('DELETE', `/api/v1/friends/${encodeURIComponent(userId)}`, token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true };
  });

  ipcMain.handle('friends:presence', async (_event, token: unknown): Promise<PresenceView> => {
    const outcome = await apiCall('GET', '/api/v1/friends/presence', token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    const payload = outcome.payload;
    return {
      ok: true,
      self: (payload['self'] as PresenceView['self']) ?? { status: 'offline', gameId: null },
      friends: (payload['friends'] as PresenceView['friends']) ?? [],
      ttlSeconds: typeof payload['ttlSeconds'] === 'number' ? (payload['ttlSeconds'] as number) : undefined,
    };
  });

  ipcMain.handle('friends:heartbeat', async (_event, gameId: unknown, token: unknown): Promise<SocialWriteResult> => {
    if (gameId !== null && typeof gameId !== 'string') {
      return { ok: false, message: 'Jogo inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/presence/heartbeat', token, { gameId });
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true };
  });
}