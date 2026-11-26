import { describe, expect, it } from 'vitest';
import {
  emptyRegistry,
  installPlugin,
  parseRegistry,
  pluginsWithCapability,
  removePlugin,
  serializeRegistry,
  setPluginEnabled,
  validateManifest,
  type PluginManifest,
} from '../src/registry.js';
import { STEAM_INTEGRATION_MANIFEST } from '../src/builtin.js';

/**
 * Plugins — o manifesto e o registo, sem disco.
 *
 * O que estes testes travam: um manifesto sem campos (ou com uma capacidade
 * desconhecida) é recusado; instalar duas vezes o mesmo identificador é uma
 * recusa; desactivar esconde o plugin das capacidades; e o registo
 * serializado volta a ler igual (o que fica no disco é o que volta).
 */

/** Um manifesto válido. */
const STEAM: PluginManifest = {
  id: 'steam-integration',
  name: 'Steam Integration',
  version: '1.0.0',
  author: 'NEXORA',
  descriptionKey: 'plugin.steam.description',
  capabilities: ['steam:sync', 'steam:cover', 'steam:dlc'],
};

describe('validateManifest', () => {
  it('aceita um manifesto completo', () => {
    const result = validateManifest(STEAM);
    expect(result.ok).toBe(true);
  });

  it('recusa um manifesto sem campos', () => {
    expect(validateManifest({ id: 'x' })).toEqual({ ok: false, reason: 'missing-field' });
    expect(validateManifest(null)).toEqual({ ok: false, reason: 'not-json' });
  });

  it('recusa um identificador ou versão mal formados', () => {
    expect(validateManifest({ ...STEAM, id: 'X' })).toEqual({ ok: false, reason: 'bad-id' });
    expect(validateManifest({ ...STEAM, version: '1.0' })).toEqual({ ok: false, reason: 'bad-version' });
  });

  it('recusa uma capacidade desconhecida (a lista é fechada)', () => {
    expect(validateManifest({ ...STEAM, capabilities: ['steam:sync', 'faz-de-contas'] })).toEqual({
      ok: false,
      reason: 'unknown-capability',
    });
  });

  it('ignora capacidades que não são texto', () => {
    const result = validateManifest({ ...STEAM, capabilities: ['steam:sync', 42] });
    expect(result.ok).toBe(true);
  });
});

describe('registo', () => {
  it('instala e activa', () => {
    const registry = installPlugin(emptyRegistry(), STEAM, '2026-11-26T10:00:00.000Z');
    expect(registry.ok).toBe(true);
    if (registry.ok) {
      expect(registry.value.plugins[0]?.enabled).toBe(true);
      expect(registry.value.plugins[0]?.installedAt).toBe('2026-11-26T10:00:00.000Z');
    }
  });

  it('não instala duas vezes o mesmo identificador', () => {
    const first = installPlugin(emptyRegistry(), STEAM, '2026-11-26T10:00:00.000Z');
    if (!first.ok) {
      throw new Error('devia instalar');
    }
    expect(installPlugin(first.value, STEAM, '2026-11-26T11:00:00.000Z')).toEqual({
      ok: false,
      reason: 'already-installed',
    });
  });

  it('desactivar esconde o plugin das capacidades', () => {
    const installed = installPlugin(emptyRegistry(), STEAM, '2026-11-26T10:00:00.000Z');
    if (!installed.ok) {
      throw new Error('devia instalar');
    }
    expect(pluginsWithCapability(installed.value, 'steam:sync')).toHaveLength(1);
    const disabled = setPluginEnabled(installed.value, 'steam-integration', false);
    expect(disabled.ok && pluginsWithCapability(disabled.value, 'steam:sync')).toHaveLength(0);
  });

  it('remover esquece o plugin', () => {
    const installed = installPlugin(emptyRegistry(), STEAM, '2026-11-26T10:00:00.000Z');
    if (!installed.ok) {
      throw new Error('devia instalar');
    }
    const removed = removePlugin(installed.value, 'steam-integration');
    if (!removed.ok) {
      throw new Error('devia remover');
    }
    expect(removed.value.plugins).toHaveLength(0);
    // O registo original não muda (a imutabilidade é o contrato) — e remover
    // outra vez do registo já limpo é uma recusa.
    expect(installed.value.plugins).toHaveLength(1);
    expect(removePlugin(removed.value, 'steam-integration')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('serializa e volta a ler igual', () => {
    const installed = installPlugin(emptyRegistry(), STEAM, '2026-11-26T10:00:00.000Z');
    if (!installed.ok) {
      throw new Error('devia instalar');
    }
    const round = parseRegistry(serializeRegistry(installed.value));
    expect(round).toEqual(installed.value);
    // Um ficheiro corrompido devolve o registo vazio (não um estado a meio).
    expect(parseRegistry('{isto não é json')).toEqual(emptyRegistry());
  });
});

describe('plugin enviado com o launcher', () => {
  it('valida contra a própria validação da plataforma', () => {
    // Um manifesto que a NEXORA envia e que a NEXORA recusaria seria um bug
    // de arranque — este teste é o que o impede.
    expect(validateManifest(STEAM_INTEGRATION_MANIFEST).ok).toBe(true);
  });

  it('activa as três capacidades que declara', () => {
    const installed = installPlugin(emptyRegistry(), STEAM_INTEGRATION_MANIFEST, '2026-11-26T10:00:00.000Z');
    if (!installed.ok) {
      throw new Error('devia instalar');
    }
    for (const id of STEAM_INTEGRATION_MANIFEST.capabilities) {
      expect(pluginsWithCapability(installed.value, id)).toHaveLength(1);
    }
  });
});
