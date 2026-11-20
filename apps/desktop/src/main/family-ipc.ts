/**
 * IPC da Família — grupo, convites e biblioteca partilhada.
 *
 * A mesma fronteira dos outros canais: o renderer nunca fala com a API
 * directamente. O token vem do renderer, é reencaminhado e esquecido — o
 * processo principal não guarda credenciais. Cada argumento é validado
 * antes de seguir, e cada recusa devolve a mensagem da API (que sempre
 * explica o motivo em português).
 */

import { ipcMain } from 'electron';
import { DEFAULT_API_BASE_URL } from './config.js';
import type {
  FamilyGameView,
  FamilyPlanView,
  FamilyResult,
  FamilyView,
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

/** Lê o grupo de um payload (`null` quando não há grupo). */
function groupOf(payload: ApiPayload): FamilyView | null {
  const group = payload['group'];
  return group === null || group === undefined ? null : (group as FamilyView);
}

/** Lê o plano de um payload (limites e benefícios). */
function planOf(payload: ApiPayload): FamilyPlanView | null {
  const plan = payload['plan'];
  return plan === null || plan === undefined ? null : (plan as FamilyPlanView);
}

/** Converte um resultado de criação de convite. */
function inviteResult(outcome: ApiOutcome): FamilyResult {
  if (!outcome.ok) {
    return { ok: false, message: outcome.message };
  }
  return {
    ok: true,
    code: typeof outcome.payload['code'] === 'string' ? (outcome.payload['code'] as string) : undefined,
    email: typeof outcome.payload['email'] === 'string' ? (outcome.payload['email'] as string) : undefined,
    expiresAt: typeof outcome.payload['expiresAt'] === 'string' ? (outcome.payload['expiresAt'] as string) : undefined,
  };
}

/** Limites de validação dos argumentos do renderer. */
const MAX_TEXT_LENGTH = 80;

/** Texto não vazio (nome do grupo, email, código). */
function isText(value: unknown, maxLength = MAX_TEXT_LENGTH): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

/** Regista os canais da Família. */
export function registerFamilyIpc(): void {
  ipcMain.handle('family:get', async (_event, token: unknown): Promise<FamilyResult> => {
    const outcome = await apiCall('GET', '/api/v1/family', token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true, group: groupOf(outcome.payload), plan: planOf(outcome.payload) ?? undefined };
  });

  ipcMain.handle('family:create', async (_event, name: unknown, token: unknown): Promise<FamilyResult> => {
    if (!isText(name)) {
      return { ok: false, message: 'Nome do grupo inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/family', token, { name: name.trim() });
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true, group: groupOf(outcome.payload) };
  });

  ipcMain.handle('family:invite', async (_event, email: unknown, token: unknown): Promise<FamilyResult> => {
    if (!isText(email, 254) || !email.includes('@')) {
      return { ok: false, message: 'Email inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/family/invites', token, { email: email.trim() });
    return inviteResult(outcome);
  });

  ipcMain.handle('family:accept', async (_event, code: unknown, token: unknown): Promise<FamilyResult> => {
    if (!isText(code, 32)) {
      return { ok: false, message: 'Código inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/family/invites/accept', token, { code: code.trim() });
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true, group: groupOf(outcome.payload) };
  });

  ipcMain.handle('family:decline', async (_event, code: unknown, token: unknown): Promise<FamilyResult> => {
    if (!isText(code, 32)) {
      return { ok: false, message: 'Código inválido.' };
    }
    const outcome = await apiCall('POST', '/api/v1/family/invites/decline', token, { code: code.trim() });
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true };
  });

  ipcMain.handle('family:remove', async (_event, userId: unknown, token: unknown): Promise<FamilyResult> => {
    if (!isText(userId, 64)) {
      return { ok: false, message: 'Membro inválido.' };
    }
    const outcome = await apiCall('DELETE', `/api/v1/family/members/${encodeURIComponent(userId)}`, token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true };
  });

  ipcMain.handle('family:dissolve', async (_event, token: unknown): Promise<FamilyResult> => {
    const outcome = await apiCall('DELETE', '/api/v1/family', token);
    if (!outcome.ok) {
      return { ok: false, message: outcome.message };
    }
    return { ok: true };
  });

  ipcMain.handle(
    'family:games',
    async (_event, token: unknown): Promise<{ ok: boolean; items?: readonly FamilyGameView[]; total?: number; message?: string }> => {
      const outcome = await apiCall('GET', '/api/v1/family/games', token);
      if (!outcome.ok) {
        return { ok: false, message: outcome.message };
      }
      const items = outcome.payload['items'];
      return {
        ok: true,
        items: Array.isArray(items) ? (items as FamilyGameView[]) : [],
        total: typeof outcome.payload['total'] === 'number' ? (outcome.payload['total'] as number) : 0,
      };
    },
  );
}