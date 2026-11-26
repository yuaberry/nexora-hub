/**
 * O registo dos plugins, no disco do utilizador.
 *
 * Um ficheiro (`plugins.json`, ao lado da base local) guarda o que está
 * instalado e o que está activo. Este módulo é o único que o escreve: o
 * processo principal lê o registo no arranque, aplica as operações e
 * persiste — e o renderer nunca vê o caminho, só o resultado.
 *
 * A escolha de um **manifesto** em vez de código tem uma consequência prática
 * que este ficheiro torna explícita: instalar um plugin é escrever uma linha
 * num JSON. Nada é executado, nada é descarregado — por isso não há
 * verificação de assinatura a inventar nem sandbox a prometer.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  STEAM_INTEGRATION_MANIFEST,
  emptyRegistry,
  installPlugin,
  parseRegistry,
  pluginsWithCapability,
  removePlugin,
  serializeRegistry,
  setPluginEnabled,
  type PluginManifest,
  type PluginRegistry,
} from '@nexora/plugins';

/** O nome do ficheiro do registo (dentro da pasta do utilizador). */
export const PLUGINS_FILE_NAME = 'plugins.json';

/** O caminho do ficheiro do registo. */
export function pluginsFilePath(userDataPath: string): string {
  return join(userDataPath, PLUGINS_FILE_NAME);
}

/** O registo em memória e onde ele vive. */
export interface PluginsStore {
  /** O caminho absoluto do ficheiro (para escrever, nunca para mostrar). */
  readonly path: string;
  /** O registo corrente — substituído por operações bem-sucedidas. */
  registry: PluginRegistry;
}

/**
 * Abre o registo do utilizador.
 *
 * Um ficheiro que não existe — ou que não é um registo válido — é um registo
 * vazio: o launcher arranca sempre, e o plugin de origem é instalado a
 * seguir. Um registo corrompido nunca é lido "a meio".
 */
export function openPluginsStore(userDataPath: string): PluginsStore {
  const path = pluginsFilePath(userDataPath);
  const registry = existsSync(path) ? parseRegistry(readFileSync(path, 'utf8')) : emptyRegistry();
  return { path, registry };
}

/** Escreve o registo no disco (criando a pasta se faltar). */
function persist(store: PluginsStore): void {
  mkdirSync(dirname(store.path), { recursive: true });
  writeFileSync(store.path, serializeRegistry(store.registry), 'utf8');
}

/** O resultado de uma escrita no registo. */
export type PluginWriteResult = 'ok' | 'already-installed' | 'not-found';

/**
 * Instala o plugin que a NEXORA envia, se ainda não estiver instalado.
 *
 * Corre no arranque. Devolve `true` quando instalou — o que só acontece uma
 * vez por máquina; daí em diante o registo já o tem, e o utilizador é dono
 * de o desactivar ou remover.
 */
export function ensureBuiltinPlugin(store: PluginsStore, now: string): boolean {
  const result = installPlugin(store.registry, STEAM_INTEGRATION_MANIFEST, now);
  if (!result.ok) {
    return false;
  }
  store.registry = result.value;
  persist(store);
  return true;
}

/** Instala um manifesto válido no registo (e persiste). */
export function installPluginInStore(
  store: PluginsStore,
  manifest: PluginManifest,
  now: string,
): PluginWriteResult {
  const result = installPlugin(store.registry, manifest, now);
  if (!result.ok) {
    return 'already-installed';
  }
  store.registry = result.value;
  persist(store);
  return 'ok';
}

/** Remove um plugin do registo (e esquece o estado). */
export function removePluginFromStore(store: PluginsStore, pluginId: string): PluginWriteResult {
  const result = removePlugin(store.registry, pluginId);
  if (!result.ok) {
    return 'not-found';
  }
  store.registry = result.value;
  persist(store);
  return 'ok';
}

/** Activa ou desactiva um plugin instalado. */
export function setPluginEnabledInStore(
  store: PluginsStore,
  pluginId: string,
  enabled: boolean,
): PluginWriteResult {
  const result = setPluginEnabled(store.registry, pluginId, enabled);
  if (!result.ok) {
    return 'not-found';
  }
  store.registry = result.value;
  persist(store);
  return 'ok';
}

/**
 * A capacidade está a ser aplicada?
 *
 * Verdadeiro quando há **pelo menos um plugin activo** que a declara — é
 * assim que um interruptor desligado faz a funcionalidade parar, sem que o
 * launcher precise de saber qual é o plugin dono dela.
 */
export function isCapabilityActive(store: PluginsStore, capabilityId: string): boolean {
  return pluginsWithCapability(store.registry, capabilityId).length > 0;
}

/** Um plugin visto pela interface (o manifesto + o estado). */
export interface PluginView {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly author: string;
  readonly descriptionKey: string;
  readonly capabilities: readonly string[];
  readonly enabled: boolean;
  readonly installedAt: string;
}

/** A lista de plugins para a interface (a ordem é a do registo). */
export function pluginViews(store: PluginsStore): readonly PluginView[] {
  return store.registry.plugins.map((plugin) => ({
    id: plugin.manifest.id,
    name: plugin.manifest.name,
    version: plugin.manifest.version,
    author: plugin.manifest.author,
    descriptionKey: plugin.manifest.descriptionKey,
    capabilities: plugin.manifest.capabilities,
    enabled: plugin.enabled,
    installedAt: plugin.installedAt,
  }));
}