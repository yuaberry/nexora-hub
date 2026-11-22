import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { findModsFolders, scanMods, type ModsReaders } from '../src/main/mods.js';

/**
 * Detector de modos — leitura real de jars.
 *
 * O que estes testes travam: a pasta de modos é encontrada nas formas que os
 * jogos usam, só os `.jar` contam (um `.disabled` está desligado), o
 * carregador vem do marcador dentro do arquivo, e uma pasta sem modos dá
 * zero — nunca um número inventado.
 */

/** Escreve um jar com as entradas dadas (zip de verdade). */
function jar(path: string, entries: Record<string, string>): void {
  const dir = join(path, '..', 'jar-staging');
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(entries)) {
    const full = join(dir, name);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  execSync(`cd ${dir} && zip -q -r ${join(path, '..')}/$(basename ${path}) ${Object.keys(entries).join(' ')}`);
  rmSync(dir, { recursive: true, force: true });
}

describe('findModsFolders', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'nexora-mods-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('encontra a mods/ ao lado do executável', () => {
    mkdirSync(join(home, 'jogo', 'mods'), { recursive: true });
    expect(findModsFolders(join(home, 'jogo'))).toEqual([join(home, 'jogo', 'mods')]);
  });

  it('encontra a .minecraft/mods de uma instância', () => {
    mkdirSync(join(home, 'instancia', '.minecraft', 'mods'), { recursive: true });
    expect(findModsFolders(join(home, 'instancia'))).toContain(join(home, 'instancia', '.minecraft', 'mods'));
  });

  it('encontra a mods/ um nível abaixo', () => {
    mkdirSync(join(home, 'jogo', 'perfil', 'mods'), { recursive: true });
    expect(findModsFolders(join(home, 'jogo'))).toContain(join(home, 'jogo', 'perfil', 'mods'));
  });

  it('sem pasta de modos não há caminho', () => {
    expect(findModsFolders(home)).toHaveLength(0);
  });
});

describe('scanMods', () => {
  let home: string;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'nexora-mods-'));
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('detecta os carregadores de jars reais', async () => {
    const mods = join(home, 'jogo', 'mods');
    mkdirSync(mods, { recursive: true });
    jar(join(mods, 'sodium.jar'), { 'fabric.mod.json': '{"id":"sodium","version":"0.6.0","name":"Sodium"}' });
    jar(join(mods, 'iris.jar'), { 'fabric.mod.json': '{"id":"iris","version":"1.7.0","name":"Iris"}' });
    jar(join(mods, 'jei.jar'), { 'META-INF/mods.toml': 'modLoader="javafml"\n[[mods]]\nmodId="jei"\ndisplayName="Just Enough Items"\nversion="15.2.0.27"\n' });
    jar(join(mods, 'random.jar'), { 'x.class': 'binary' });

    const vista = await scanMods(join(home, 'jogo'));
    expect(vista.total).toBe(4);
    expect(vista.byLoader.find((entry) => entry.loader === 'fabric')?.count).toBe(2);
    expect(vista.byLoader.find((entry) => entry.loader === 'forge')?.count).toBe(1);
    expect(vista.unknown).toBe(1);
    const sodium = vista.mods.find((mod) => mod.fileName === 'sodium.jar');
    expect(sodium?.displayName).toBe('Sodium');
    expect(sodium?.version).toBe('0.6.0');
    const jei = vista.mods.find((mod) => mod.fileName === 'jei.jar');
    expect(jei?.displayName).toBe('Just Enough Items');
  });

  it('um mod desligado (.jar.disabled) não conta', async () => {
    const mods = join(home, 'jogo', 'mods');
    mkdirSync(mods, { recursive: true });
    jar(join(mods, 'activo.jar'), { 'fabric.mod.json': '{"id":"a"}' });
    chmodSync(join(mods, 'activo.jar'), 0o644);
    writeFileSync(join(mods, 'desligado.jar.disabled'), 'binary');

    const vista = await scanMods(join(home, 'jogo'));
    expect(vista.total).toBe(1);
  });

  it('uma pasta sem modos dá zero, não um número inventado', async () => {
    const mods = join(home, 'jogo', 'mods');
    mkdirSync(mods, { recursive: true });
    const vista = await scanMods(join(home, 'jogo'));
    expect(vista.total).toBe(0);
    expect(vista.mods).toHaveLength(0);
    expect(vista.folder).toBe(mods);
  });

  it('um jogo sem pasta de modos devolve folder null', async () => {
    const vista = await scanMods(join(home, 'sem-jogo'));
    expect(vista.folder).toBeNull();
    expect(vista.total).toBe(0);
  });

  it('leitores injectáveis (sem tocar no sistema)', async () => {
    const mods = join(home, 'jogo', 'mods');
    mkdirSync(mods, { recursive: true });
    writeFileSync(join(mods, 'sodium.jar'), 'binary');
    const leitores: ModsReaders = {
      listJarEntries: async (jarPath) => (jarPath.endsWith('sodium.jar') ? ['fabric.mod.json'] : []),
      readJarEntry: async (_jar, entry) => (entry === 'fabric.mod.json' ? '{"id":"sodium","name":"Sodium"}' : null),
    };
    const vista = await scanMods(join(home, 'jogo'), leitores);
    expect(vista.mods[0]?.loader).toBe('fabric');
    expect(vista.mods[0]?.displayName).toBe('Sodium');
  });
});
