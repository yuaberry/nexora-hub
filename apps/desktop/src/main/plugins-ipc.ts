/**
 * IPC dos plugins — listar, instalar, activar, desactivar e remover.
 *
 * Instalar um plugin é ler um **manifesto** que o utilizador escolheu: o
 * ficheiro é lido, validado contra a lista fechada de capacidades e escrito
 * no registo. Nada é executado — um plugin não é código, é uma declaração do
 * que o launcher já sabe fazer, ligada a este computador.
 *
 * O plugin que a NEXORA envia não é permanente: quando foi removido, volta a
 * aparecer como **disponível** e o utilizador reinstala-o com um clique.
 */

import { dialog, ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import {
  KNOWN_CAPABILITIES,
  STEAM_INTEGRATION_MANIFEST,
  validateManifest,
  type PluginManifest,
} from '@nexora/plugins';
import {
  installPluginInStore,
  pluginViews,
  removePluginFromStore,
  setPluginEnabledInStore,
  type PluginView,
  type PluginsStore,
} from './plugins-state.js';

/** Uma capacidade conhecida, para a interface desenhar o nome. */
interface CapabilityOption {
  readonly id: string;
  readonly nameKey: string;
}

/** A lista de plugins vista pelo renderer. */
interface PluginsListResult {
  readonly ok: boolean;
  readonly items: readonly PluginView[];
  /** As capacidades que a plataforma aplica (para a interface explicar). */
  readonly capabilities: readonly CapabilityOption[];
  /** O plugin de origem, quando não está instalado (pode ser reinstalado). */
  readonly available: PluginManifest | null;
}

/** Regista os canais dos plugins. */
export function registerPluginsIpc(store: PluginsStore): void {
  ipcMain.handle('plugins:list', (): PluginsListResult => {
    const installed = store.registry.plugins.some((plugin) => plugin.manifest.id === STEAM_INTEGRATION_MANIFEST.id);
    return {
      ok: true,
      items: pluginViews(store),
      capabilities: KNOWN_CAPABILITIES.map((capability) => ({ id: capability.id, nameKey: capability.nameKey })),
      available: installed ? null : STEAM_INTEGRATION_MANIFEST,
    };
  });

  ipcMain.handle(
    'plugins:setEnabled',
    (_event, pluginId: unknown, enabled: unknown): { readonly ok: boolean; readonly reasonKey?: string } => {
      if (typeof pluginId !== 'string' || pluginId === '' || typeof enabled !== 'boolean') {
        return { ok: false, reasonKey: 'plugins.reason.invalid' };
      }
      const result = setPluginEnabledInStore(store, pluginId, enabled);
      return result === 'ok' ? { ok: true } : { ok: false, reasonKey: 'plugins.reason.not-found' };
    },
  );

  ipcMain.handle('plugins:remove', (_event, pluginId: unknown): { readonly ok: boolean; readonly reasonKey?: string } => {
    if (typeof pluginId !== 'string' || pluginId === '') {
      return { ok: false, reasonKey: 'plugins.reason.invalid' };
    }
    const result = removePluginFromStore(store, pluginId);
    return result === 'ok' ? { ok: true } : { ok: false, reasonKey: 'plugins.reason.not-found' };
  });

  /**
   * Instala a partir de um manifesto do utilizador.
   *
   * O selector devolve um caminho; o ficheiro tem de ser JSON válido com os
   * campos do contrato. Cancelar não é erro — e um manifesto inválido devolve
   * o motivo, para que a interface o diga em português.
   */
  ipcMain.handle('plugins:install', async (): Promise<{
    readonly ok: boolean;
    readonly reasonKey?: string;
    readonly plugin?: PluginView;
  }> => {
    const picked = await dialog.showOpenDialog({
      title: 'Instalar plugin (manifest.json)',
      properties: ['openFile'],
      filters: [{ name: 'Manifesto de plugin', extensions: ['json'] }],
    });
    if (picked.canceled || picked.filePaths.length === 0) {
      return { ok: false, reasonKey: 'plugins.reason.cancelled' };
    }
    const file = picked.filePaths[0];
    if (file === undefined) {
      return { ok: false, reasonKey: 'plugins.reason.cancelled' };
    }

    let document: unknown;
    try {
      document = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return { ok: false, reasonKey: 'plugins.reason.not-json' };
    }

    const validation = validateManifest(document);
    if (!validation.ok) {
      return { ok: false, reasonKey: `plugins.reason.${validation.reason}` };
    }

    const written = installPluginInStore(store, validation.manifest, new Date().toISOString());
    if (written === 'already-installed') {
      return { ok: false, reasonKey: 'plugins.reason.already-installed' };
    }
    const view = pluginViews(store).find((plugin) => plugin.id === validation.manifest.id);
    if (view === undefined) {
      return { ok: false, reasonKey: 'plugins.reason.not-found' };
    }
    return { ok: true, plugin: view };
  });

  /** Reinstala o plugin de origem (depois de removido). */
  ipcMain.handle('plugins:installBuiltin', (): { readonly ok: boolean; readonly reasonKey?: string } => {
    const written = installPluginInStore(store, STEAM_INTEGRATION_MANIFEST, new Date().toISOString());
    return written === 'ok' ? { ok: true } : { ok: false, reasonKey: 'plugins.reason.already-installed' };
  });
}