/**
 * IPC do catálogo — procurar pelo AppID ou pelo nome e guardar na biblioteca.
 *
 * Três canais, todos no mesmo espírito: o utilizador manda, o processo
 * principal valida e fala com a loja. A rede **nunca** instala nada — uma
 * entrada nova é metadado; os ficheiros continuam a vir da loja oficial ou
 * do disco do próprio utilizador.
 */

import { ipcMain } from 'electron';
import { isSteamAppId, type SteamAppSummary } from '@nexora/core';
import { installedSteamAppIds, lookupSteamApp, lookupSteamDescription, lookupSteamDlcs, searchSteamApps } from './steam-catalog.js';
import { isCapabilityActive, type PluginsStore } from './plugins-state.js';
import type { LocalLibrary } from './db.js';
import { cacheRemoteCover } from './cover-cache.js';
import type { DlcView } from '../shared/preload-api.js';

/** Um AppID válido, ou `null` (quem chama devolve a mensagem). */
function validAppId(value: unknown): string | null {
  return isSteamAppId(value) ? value : null;
}

/**
 * Regista os canais do catálogo da Steam.
 *
 * `plugins` é o registo dos plugins: listar as DLCs é uma capacidade que um
 * plugin activo declara — sem plugin activo, o canal diz-o em vez de fingir.
 */
export function registerCatalogIpc(
  library: LocalLibrary,
  coversDir: string,
  plugins: PluginsStore,
): void {
  // Os detalhes de um AppID (nome, tipo, gratuito, DLCs declaradas).
  ipcMain.handle('steam:lookup', async (_event, appId: unknown): Promise<{
    readonly ok: boolean;
    readonly app?: SteamAppSummary;
    readonly message?: string;
  }> => {
    const id = validAppId(appId);
    if (id === null) {
      return { ok: false, message: 'AppID inválido.' };
    }
    try {
      const app = await lookupSteamApp(id);
      return app === null
        ? { ok: false, message: 'A loja não conhece este AppID.' }
        : { ok: true, app };
    } catch {
      return { ok: false, message: 'Loja inacessível.' };
    }
  });

  // A busca por nome (encontrar o AppID antes de adicionar).
  ipcMain.handle('steam:search', async (_event, term: unknown): Promise<{
    readonly ok: boolean;
    readonly items?: readonly SteamAppSummary[];
    readonly message?: string;
  }> => {
    if (typeof term !== 'string') {
      return { ok: false, message: 'Termo em falta.' };
    }
    try {
      const items = await searchSteamApps(term);
      return { ok: true, items };
    } catch {
      return { ok: false, message: 'Loja inacessível.' };
    }
  });

  /**
   * Adiciona um jogo à biblioteca pelo AppID.
   *
   * Se o jogo já lá está (importado do disco, ou adicionado antes), a entrada
   * que existe fica como está — nome, capa e tempo jogado são do utilizador
   * — e a resposta diz que já estava. Só uma entrada **nova** nasce aqui, sem
   * caminho de instalação: o jogo não está no disco.
   */
  ipcMain.handle('library:addCatalog', async (_event, appId: unknown): Promise<{
    readonly ok: boolean;
    readonly duplicate?: boolean;
    readonly gameId?: string;
    readonly title?: string;
    readonly message?: string;
  }> => {
    const id = validAppId(appId);
    if (id === null) {
      return { ok: false, message: 'AppID inválido.' };
    }
    try {
      const app = await lookupSteamApp(id);
      if (app === null) {
        return { ok: false, message: 'A loja não conhece este AppID.' };
      }
      const existing = library.bySteamAppId(id);
      if (existing !== null) {
        return { ok: true, duplicate: true, gameId: String(existing.id), title: existing.title };
      }
      // A cápsula da loja passa pelo processo principal (o renderer não
      // consegue carregá-la) e fica no cache do disco: a entrada abre com a
      // capa visível, e a segunda vez já é local.
      const cachedCover = await cacheRemoteCover(app.coverUrl, coversDir);
      const record = library.upsert({
        externalKey: `steam-app:${id}`,
        title: app.title,
        cover: cachedCover ?? app.coverUrl,
        // Sem caminhos: a entrada é metadado, e a interface mostra "não
        // instalado" com o link da loja em vez de um botão que não arranca.
        installPath: null,
        executablePath: null,
        steamAppId: id,
        tags: [app.kind === 'game' ? 'steam' : app.kind],
      });
      return { ok: true, duplicate: false, gameId: String(record.id), title: record.title };
    } catch {
      return { ok: false, message: 'Loja inacessível.' };
    }
  });

  /**
   * A descrição curta de um jogo da biblioteca.
   *
   * A loja é perguntada **uma vez**: a resposta fica guardada na base local e
   * a página dos detalhes passa a lê-la de lá — a biblioteca continua
   * completa offline.
   */
  ipcMain.handle('steam:describe', async (_event, gameId: unknown): Promise<{
    readonly ok: boolean;
    readonly description?: string;
    readonly message?: string;
  }> => {
    const numericId = typeof gameId === 'number' ? gameId : Number(gameId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, message: 'Jogo em falta.' };
    }
    const entry = library.findById(numericId);
    if (entry === null) {
      return { ok: false, message: 'Jogo não encontrado.' };
    }
    if (entry.description !== null) {
      return { ok: true, description: entry.description };
    }
    if (entry.steamAppId === null) {
      return { ok: false, message: 'Jogo sem AppID da Steam.' };
    }
    try {
      const description = await lookupSteamDescription(entry.steamAppId);
      if (description === null) {
        return { ok: false, message: 'A loja não deu descrição para este jogo.' };
      }
      library.setDescription(numericId, description);
      return { ok: true, description };
    } catch {
      return { ok: false, message: 'Loja inacessível.' };
    }
  });

  /**
   * As DLCs declaradas de um jogo da biblioteca.
   *
   * Os nomes vêm da loja; a marca de "instalada" vem do disco (a mesma lista
   * de AppIDs dos manifestos). O resultado fica guardado: a segunda vez que se
   * abre a página, a lista já está lá — e a loja não é chamada outra vez.
   */
  ipcMain.handle('steam:dlcs', async (_event, gameId: unknown): Promise<{
    readonly ok: boolean;
    readonly items?: readonly DlcView[];
    readonly truncated?: number;
    readonly message?: string;
    readonly reasonKey?: string;
  }> => {
    if (!isCapabilityActive(plugins, 'steam:dlc')) {
      return { ok: false, reasonKey: 'plugins.off' };
    }
    const numericId = typeof gameId === 'number' ? gameId : Number(gameId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return { ok: false, message: 'Jogo em falta.' };
    }
    const entry = library.findById(numericId);
    if (entry === null || entry.steamAppId === null) {
      return { ok: false, message: 'Jogo sem AppID da Steam.' };
    }
    try {
      const installed = installedSteamAppIds();
      const result = await lookupSteamDlcs(entry.steamAppId);
      const dlcs: readonly DlcView[] = result.items.map((app) => ({
        appId: app.appId,
        title: app.title,
        kind: app.kind,
        free: app.free,
        installed: installed.has(app.appId),
      }));
      library.setDlcs(entry.externalKey, dlcs);
      return { ok: true, items: dlcs, truncated: result.truncated };
    } catch {
      return { ok: false, message: 'Loja inacessível.' };
    }
  });
}