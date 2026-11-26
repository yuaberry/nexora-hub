import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { STEAM_INTEGRATION_MANIFEST } from '@nexora/plugins';
import {
  ensureBuiltinPlugin,
  installPluginInStore,
  isCapabilityActive,
  openPluginsStore,
  pluginViews,
  pluginsFilePath,
  removePluginFromStore,
  setPluginEnabledInStore,
  type PluginsStore,
} from '../src/main/plugins-state.js';

/**
 * O registo dos plugins no disco.
 *
 * O que estes testes travam: o plugin de origem é instalado uma só vez; um
 * registo corrompido arranca vazio (não a meio); desactivar esconde a
 * capacidade; e o que fica no disco é exactamente o que volta a ser lido —
 * incluindo depois de uma "sessão" nova (um store novo na mesma pasta).
 */
describe('registo de plugins', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-plugins-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  /** Um store novo, como no arranque da aplicação. */
  function open(): PluginsStore {
    return openPluginsStore(dir);
  }

  it('instala o plugin de origem no primeiro arranque — e só nesse', () => {
    const store = open();
    expect(ensureBuiltinPlugin(store, '2026-11-26T10:00:00.000Z')).toBe(true);
    expect(ensureBuiltinPlugin(store, '2026-11-26T11:00:00.000Z')).toBe(false);

    const views = pluginViews(store);
    expect(views).toHaveLength(1);
    expect(views[0]?.id).toBe('steam-integration');
    expect(views[0]?.enabled).toBe(true);
    // O registo fica no disco, ao lado da base local.
    expect(existsSync(pluginsFilePath(dir))).toBe(true);
  });

  it('um registo corrompido arranca vazio, não a meio', () => {
    writeFileSync(pluginsFilePath(dir), '{isto não é json', 'utf8');
    const store = open();
    expect(store.registry.plugins).toHaveLength(0);
    // E a corrupção não impede o plugin de origem de ser instalado.
    expect(ensureBuiltinPlugin(store, '2026-11-26T10:00:00.000Z')).toBe(true);
    expect(pluginViews(store)).toHaveLength(1);
  });

  it('desactivar o plugin desliga as capacidades; activar volta a ligá-las', () => {
    const store = open();
    ensureBuiltinPlugin(store, '2026-11-26T10:00:00.000Z');
    expect(isCapabilityActive(store, 'steam:sync')).toBe(true);
    expect(isCapabilityActive(store, 'steam:cover')).toBe(true);
    expect(isCapabilityActive(store, 'steam:dlc')).toBe(true);

    setPluginEnabledInStore(store, 'steam-integration', false);
    for (const id of ['steam:sync', 'steam:cover', 'steam:dlc']) {
      expect(isCapabilityActive(store, id)).toBe(false);
    }

    setPluginEnabledInStore(store, 'steam-integration', true);
    expect(isCapabilityActive(store, 'steam:sync')).toBe(true);
  });

  it('remover esquece o plugin — e reinstalar volta a ligar as capacidades', () => {
    const store = open();
    ensureBuiltinPlugin(store, '2026-11-26T10:00:00.000Z');
    expect(removePluginFromStore(store, 'steam-integration')).toBe('ok');
    expect(pluginViews(store)).toHaveLength(0);
    expect(removePluginFromStore(store, 'steam-integration')).toBe('not-found');

    // Reinstalar o mesmo manifesto volta a ligar as capacidades (o caminho
    // que a página oferece quando o plugin aparece como disponível).
    expect(installPluginInStore(store, STEAM_INTEGRATION_MANIFEST, '2026-11-26T12:00:00.000Z')).toBe('ok');
    expect(pluginViews(store)).toHaveLength(1);
    expect(isCapabilityActive(store, 'steam:sync')).toBe(true);
  });

  it('o que fica no disco é o que volta a ser lido noutra sessão', () => {
    const first = open();
    ensureBuiltinPlugin(first, '2026-11-26T10:00:00.000Z');
    setPluginEnabledInStore(first, 'steam-integration', false);

    // Uma "sessão" nova, na mesma pasta: o estado tem de sobreviver.
    const second = open();
    const views = pluginViews(second);
    expect(views).toHaveLength(1);
    expect(views[0]?.enabled).toBe(false);
    expect(isCapabilityActive(second, 'steam:dlc')).toBe(false);
  });

  it('a pasta do utilizador é criada se não existir', () => {
    const nested = join(dir, 'perfil', 'nexora-hub');
    mkdirSync(nested, { recursive: true });
    const store = openPluginsStore(nested);
    rmSync(nested, { recursive: true, force: true });
    expect(ensureBuiltinPlugin(store, '2026-11-26T10:00:00.000Z')).toBe(true);
    expect(JSON.parse(readFileSync(pluginsFilePath(nested), 'utf8'))).toHaveProperty('plugins');
  });
});