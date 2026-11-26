/**
 * Validação e registo de plugins — puro, testado sem disco.
 *
 * Duas perguntas, respondidas sem efeitos secundários:
 *
 * - **um manifesto é válido?** — os campos obrigatórios, o identificador, a
 *   versão semântica e as capacidades da lista fechada (uma capacidade
 *   desconhecida é uma recusa, não um aviso);
 * - **o registo é coerente?** — instalar, activar, desactivar e remover sem
 *   deixar o estado inconsistente (e sem permitir dois plugins com o mesmo
 *   identificador).
 */

import {
  KNOWN_CAPABILITIES,
  type InstalledPlugin,
  type ManifestValidation,
  type PluginManifest,
} from './types.js';

// O registo é feito de manifestos: quem consome o `registry.js` precisa do
// tipo para tipar as suas operações, sem importar um segundo módulo.
export type { PluginManifest } from './types.js';

/** Um identificador de plugin: minúsculas, dígitos e traços. */
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** Uma versão semântica simples (`1.0.0`, `2.11.3`). */
const VERSION_PATTERN = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

/**
 * Valida um manifesto desconhecido (o que veio de um ficheiro do utilizador).
 *
 * A ordem das recusas é deliberada: primeiro o que o documento **é** (JSON,
 * campos), depois a forma dos campos, e só no fim as capacidades — um
 * manifesto que não é JSON não tem capacidades a avaliar.
 */
export function validateManifest(input: unknown): ManifestValidation {
  if (typeof input !== 'object' || input === null) {
    return { ok: false, reason: 'not-json' };
  }
  const document = input as Record<string, unknown>;
  const id = document['id'];
  const name = document['name'];
  const version = document['version'];
  const author = document['author'];
  const descriptionKey = document['descriptionKey'];
  const capabilities = document['capabilities'];

  if (
    typeof id !== 'string' ||
    typeof name !== 'string' ||
    typeof version !== 'string' ||
    typeof author !== 'string' ||
    typeof descriptionKey !== 'string' ||
    !Array.isArray(capabilities)
  ) {
    return { ok: false, reason: 'missing-field' };
  }
  if (!ID_PATTERN.test(id)) {
    return { ok: false, reason: 'bad-id' };
  }
  if (!VERSION_PATTERN.test(version)) {
    return { ok: false, reason: 'bad-version' };
  }
  const known = new Set(KNOWN_CAPABILITIES.map((capability) => capability.id));
  const declared = capabilities.filter((item): item is string => typeof item === 'string');
  if (declared.some((capability) => !known.has(capability))) {
    return { ok: false, reason: 'unknown-capability' };
  }

  return {
    ok: true,
    manifest: { id, name, version, author, descriptionKey, capabilities: declared },
  };
}

/** O registo dos plugins instalados (estado puro). */
export interface PluginRegistry {
  readonly plugins: readonly InstalledPlugin[];
}

/** Um registo vazio. */
export function emptyRegistry(): PluginRegistry {
  return { plugins: [] };
}

/** O resultado de uma operação do registo. */
export type RegistryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'already-installed' | 'not-found' };

/**
 * Instala um plugin (um manifesto válido, ainda não instalado).
 *
 * Instalar duas vezes o mesmo identificador é uma recusa: a actualização de
 * versão é uma operação própria (remover e instalar), para que o estado
 * anterior nunca desapareça em silêncio.
 */
export function installPlugin(
  registry: PluginRegistry,
  manifest: PluginManifest,
  now: string,
): RegistryResult<PluginRegistry> {
  if (registry.plugins.some((plugin) => plugin.manifest.id === manifest.id)) {
    return { ok: false, reason: 'already-installed' };
  }
  return {
    ok: true,
    value: {
      plugins: [...registry.plugins, { manifest, enabled: true, installedAt: now }],
    },
  };
}

/** Remove um plugin (e esquece o estado). */
export function removePlugin(registry: PluginRegistry, pluginId: string): RegistryResult<PluginRegistry> {
  if (!registry.plugins.some((plugin) => plugin.manifest.id === pluginId)) {
    return { ok: false, reason: 'not-found' };
  }
  return {
    ok: true,
    value: { plugins: registry.plugins.filter((plugin) => plugin.manifest.id !== pluginId) },
  };
}

/** Activa ou desactiva um plugin instalado. */
export function setPluginEnabled(
  registry: PluginRegistry,
  pluginId: string,
  enabled: boolean,
): RegistryResult<PluginRegistry> {
  if (!registry.plugins.some((plugin) => plugin.manifest.id === pluginId)) {
    return { ok: false, reason: 'not-found' };
  }
  return {
    ok: true,
    value: {
      plugins: registry.plugins.map((plugin) =>
        plugin.manifest.id === pluginId ? { ...plugin, enabled } : plugin,
      ),
    },
  };
}

/** Os plugins activos que declaram uma capacidade (a ordem é a do registo). */
export function pluginsWithCapability(
  registry: PluginRegistry,
  capabilityId: string,
): readonly InstalledPlugin[] {
  return registry.plugins.filter(
    (plugin) => plugin.enabled && plugin.manifest.capabilities.includes(capabilityId),
  );
}

/** Serializa e desserializa o registo (o que fica no disco). */
export function serializeRegistry(registry: PluginRegistry): string {
  return JSON.stringify(registry, null, 2);
}

/** Lê um registo do disco (`emptyRegistry` quando o ficheiro não é válido). */
export function parseRegistry(text: string): PluginRegistry {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as PluginRegistry).plugins)) {
      return emptyRegistry();
    }
    return parsed as PluginRegistry;
  } catch {
    return emptyRegistry();
  }
}