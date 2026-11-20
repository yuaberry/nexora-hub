/**
 * IPC de fontes e downloads.
 *
 * O renderer pede; o processo principal faz o trabalho com ficheiros e rede.
 * Cada argumento é validado — o que vem do renderer é entrada externa — e os
 * erros voltam como **código + texto**, para a interface traduzir o motivo em
 * vez de mostrar uma excepção crua.
 */

import { dialog, ipcMain } from 'electron';
import {
  createDownloadState,
  installManifestFile,
  queueGame,
  retryExtraction,
  verifyInstalledGame,
  type DownloadState,
} from './download-state.js';
import { fetchProtonRating } from './protondb.js';
import type { LocalLibrary } from './db.js';

/** Resultado de uma operação de fonte (contrato com o renderer). */
export interface SourceOperationResult {
  readonly ok: boolean;
  readonly code?: string;
  readonly message?: string;
  readonly sourceId?: string;
  readonly taskIds?: readonly string[];
}

/** Regista os canais de fontes e downloads; devolve o estado partilhado. */
export function registerDownloadsIpc(library: LocalLibrary): DownloadState {
  const state = createDownloadState(library);

  // ---- Fontes ---------------------------------------------------------

  // Instalar um manifesto: o diálogo pede um `.json` (o manifesto é um
  // ficheiro, não uma pasta) e o processo principal lê e valida.
  ipcMain.handle('sources:installFile', async (): Promise<SourceOperationResult> => {
    const chosen = await dialog.showOpenDialog({
      title: 'Escolher manifesto de fonte (.json)',
      properties: ['openFile'],
      filters: [{ name: 'Manifesto de fonte', extensions: ['json'] }],
    });
    if (chosen.canceled || chosen.filePaths.length === 0) {
      return { ok: false, code: 'cancelled', message: 'Escolha cancelada.' };
    }
    const result = await installManifestFile(state, chosen.filePaths[0]!);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return { ok: true, sourceId: result.sourceId };
  });

  // Instalação programática (automação e CI): lê um manifesto de um caminho
  // conhecido, sem diálogo. A validação é a mesma — o `@nexora/sources`
  // recusa sem attestation.
  ipcMain.handle('sources:installPath', async (_event, manifestPath: unknown): Promise<SourceOperationResult> => {
    if (typeof manifestPath !== 'string' || manifestPath === '') {
      return { ok: false, code: 'file-missing', message: 'Caminho do manifesto em falta.' };
    }
    const result = await installManifestFile(state, manifestPath);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return { ok: true, sourceId: result.sourceId };
  });

  ipcMain.handle('sources:list', () =>
    state.registry.list().map((source) => ({
      id: source.manifest.id,
      name: source.manifest.name,
      description: source.manifest.description,
      origin: source.origin,
      installedAt: source.installedAt,
      legal: source.manifest.legal,
      games: source.manifest.games.length,
    })),
  );

  ipcMain.handle('sources:search', (_event, query: unknown, limit?: unknown) => {
    if (typeof query !== 'string' || query.trim() === '') {
      return [];
    }
    const take = typeof limit === 'number' && limit > 0 ? Math.min(limit, 50) : 20;
    return state.registry.search(query, take).map((hit) => {
      const game = state.registry.game(hit.game.id);
      return {
        id: hit.game.id,
        title: hit.game.title,
        score: hit.score,
        match: hit.match,
        available: game?.available ?? false,
        launcherRequired: game?.launcherRequired ?? false,
        steamAppId: game?.steamAppId ?? null,
      };
    });
  });

  ipcMain.handle('sources:remove', (_event, sourceId: unknown) => {
    if (typeof sourceId !== 'string' || sourceId === '') {
      return false;
    }
    return state.registry.remove(sourceId);
  });

  // ---- Downloads ------------------------------------------------------

  // A lista inclui os erros de extracção por jogo: a interface mostra o
  // motivo e oferece retentar — em vez de esconder um arquivo que ficou.
  ipcMain.handle('downloads:list', () => ({
    tasks: state.queue.list(),
    extractionErrors: Object.fromEntries(state.extractionErrors),
  }));

  // Verificação de integridade dos ficheiros no disco (qualquer fonte).
  ipcMain.handle(
    'downloads:verify',
    async (_event, unifiedId: unknown, installFolder: unknown): Promise<SourceOperationResult> => {
      if (typeof unifiedId !== 'string' || typeof installFolder !== 'string') {
        return { ok: false, code: 'invalid', message: 'Identificador ou pasta em falta.' };
      }
      // (`installFolder` é a raiz do destino; a pasta do jogo é resolvida a
      // partir do título do manifesto, dentro do estado.)
      const result = await verifyInstalledGame(state, unifiedId, installFolder);
      if (!result.ok) {
        return { ok: false, code: result.code, message: result.message };
      }
      return {
        ok: true,
        code: result.verification.ok ? 'verified' : 'mismatch',
        message: `${result.verification.verifiedCount} ficheiro(s) verificado(s).`,
      };
    },
  );

  ipcMain.handle('downloads:add', async (_event, unifiedId: unknown, destinationRoot: unknown): Promise<SourceOperationResult> => {
    if (typeof unifiedId !== 'string' || unifiedId === '') {
      return { ok: false, code: 'game-not-found', message: 'Identificador de jogo em falta.' };
    }
    if (typeof destinationRoot !== 'string' || destinationRoot === '') {
      return { ok: false, code: 'file-missing', message: 'Pasta de destino em falta.' };
    }
    const result = await queueGame(state, unifiedId, destinationRoot);
    if (!result.ok) {
      return { ok: false, code: result.code, message: result.message };
    }
    return { ok: true, taskIds: result.taskIds };
  });

  // Rating do ProtonDB: consulta externa, só quando o manifesto declara o app id.
  ipcMain.handle('downloads:protonRating', async (_event, unifiedId: unknown) => {
    if (typeof unifiedId !== 'string') {
      return { ok: false, reasonKey: 'no-app-id', reason: 'Jogo em falta.' };
    }
    const game = state.registry.game(unifiedId);
    if (game === null) {
      return { ok: false, reasonKey: 'no-app-id', reason: 'Jogo não encontrado no catálogo unificado.' };
    }
    const result = await fetchProtonRating(game.steamAppId);
    if (!result.ok) {
      return { ok: false, reasonKey: result.reasonKey, reason: result.reason };
    }
    return {
      ok: true,
      reason: `${result.rating.tier} · ${result.rating.total} relatórios`,
      rating: result.rating,
    };
  });

  // Retentar a extracção (depois de instalar a ferramenta em falta).
  ipcMain.handle('downloads:retryExtract', async (_event, unifiedId: unknown) => {
    if (typeof unifiedId !== 'string') {
      return { ok: false, message: 'Jogo em falta.' };
    }
    const result = await retryExtraction(state, unifiedId);
    return { ok: result.ok, message: result.reason ?? 'Extracção concluída.' };
  });

  ipcMain.handle('downloads:pause', (_event, taskId: unknown) =>
    typeof taskId === 'string' ? state.queue.pause(taskId) : false,
  );

  ipcMain.handle('downloads:resume', (_event, taskId: unknown) =>
    typeof taskId === 'string' ? state.queue.resume(taskId) : false,
  );

  ipcMain.handle('downloads:cancel', (_event, taskId: unknown) =>
    typeof taskId === 'string' ? state.queue.cancel(taskId) : false,
  );

  return state;
}