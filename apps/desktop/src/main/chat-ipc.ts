/**
 * IPC do chat — conversas directas entre amigos.
 *
 * O renderer pede; o processo principal fala com a API com o token da sessão
 * (que nunca guarda). As regras — só amigos conversam, só participantes leem
 * — são do servidor.
 */

import { ipcMain } from 'electron';
import { DEFAULT_API_BASE_URL } from './config.js';
import type {
  ChatConversationView,
  ChatMessageView,
  ChatOpenResult,
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
  method: 'GET' | 'POST',
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

/** Regista os canais do chat. */
export function registerChatIpc(): void {
  // As minhas conversas.
  ipcMain.handle('chat:list', async (_event, token: unknown): Promise<{ readonly ok: boolean; readonly items?: readonly ChatConversationView[]; readonly message?: string }> => {
    const outcome = await apiCall('GET', '/api/v1/chat/conversations', token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    const items = outcome.payload['items'];
    return { ok: true, items: Array.isArray(items) ? (items as ChatConversationView[]) : [] };
  });

  // Abre (ou reutiliza) a conversa com alguém por email.
  ipcMain.handle('chat:open', async (_event, email: unknown, token: unknown): Promise<ChatOpenResult> => {
    if (typeof email !== 'string' || !email.includes('@')) {
      return { ok: false, message: 'Email inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/chat/conversations', token, { email: email.trim() });
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return {
      ok: true,
      id: typeof outcome.payload['id'] === 'string' ? (outcome.payload['id'] as string) : undefined,
    };
  });

  // As mensagens de uma conversa.
  ipcMain.handle('chat:messages', async (_event, conversationId: unknown, token: unknown): Promise<{ readonly ok: boolean; readonly items?: readonly ChatMessageView[]; readonly message?: string }> => {
    if (typeof conversationId !== 'string' || conversationId === '') {
      return { ok: false, message: 'Conversa em falta.' };
    }
    const outcome = await apiCall('GET', `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`, token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    const items = outcome.payload['items'];
    return { ok: true, items: Array.isArray(items) ? (items as ChatMessageView[]) : [] };
  });

  // Envia uma mensagem.
  ipcMain.handle('chat:send', async (_event, conversationId: unknown, body: unknown, token: unknown): Promise<{ readonly ok: boolean; readonly item?: ChatMessageView; readonly message?: string }> => {
    if (typeof conversationId !== 'string' || conversationId === '') {
      return { ok: false, message: 'Conversa em falta.' };
    }
    if (typeof body !== 'string' || body.trim() === '') {
      return { ok: false, message: 'Mensagem vazia.' };
    }
    const outcome = await apiCall(
      'POST',
      `/api/v1/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
      token,
      { body: body.trim() },
    );
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true, item: outcome.payload as unknown as ChatMessageView };
  });
}