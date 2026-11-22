import { describe, expect, it } from 'vitest';
import {
  detectMods,
  loaderLabelKey,
  loaderOf,
  summarizeMods,
  type ModArchive,
} from '../src/mods/detect.js';

/** Um arquivo de modos com as entradas que o teste quiser. */
function arquivo(entries: readonly string[], manifestText?: string): ModArchive {
  return {
    fileName: 'mod.jar',
    sizeBytes: 1_000,
    entries,
    manifestText: manifestText ?? null,
  };
}

/** Manifesto Fabric real (a forma que o Fabric escreve). */
const FABRIC_MANIFEST = JSON.stringify({
  schemaVersion: 1,
  id: 'sodium',
  version: '0.6.0',
  name: 'Sodium',
  license: 'ARR',
});

/** Manifesto TOML do Forge (a forma que o Forge escreve). */
const FORGE_MANIFEST = `modLoader="javafml"
loaderVersion="[47,)"
license="MIT"
[[mods]]
modId="jei"
displayName="Just Enough Items"
version="15.2.0.27"
`;

describe('loaderOf', () => {
  it('o Fabric declara-se pelo fabric.mod.json', () => {
    expect(loaderOf(arquivo(['fabric.mod.json', 'assets/', 'classes/']))).toBe('fabric');
  });

  it('o Quilt declara-se pelo quilt.mod.json', () => {
    expect(loaderOf(arquivo(['quilt.mod.json', 'assets/']))).toBe('quilt');
  });

  it('o Forge declara-se pelo META-INF/mods.toml', () => {
    expect(loaderOf(arquivo(['META-INF/mods.toml', 'META-INF/MANIFEST.MF']))).toBe('forge');
  });

  it('o NeoForge é testado antes do Forge (o pacote contém os dois)', () => {
    expect(loaderOf(arquivo(['META-INF/neoforge.mods.toml', 'META-INF/mods.toml']))).toBe('neoforge');
  });

  it('um arquivo sem marcador é desconhecido (nunca adivinhado)', () => {
    expect(loaderOf(arquivo(['META-INF/MANIFEST.MF', 'mod.class']))).toBe('unknown');
  });
});

describe('detectMods', () => {
  it('lê o nome e a versão do manifesto JSON', () => {
    const [mod] = detectMods([arquivo(['fabric.mod.json'], FABRIC_MANIFEST)]);
    expect(mod?.displayName).toBe('Sodium');
    expect(mod?.version).toBe('0.6.0');
  });

  it('lê o nome e a versão do manifesto TOML', () => {
    const [mod] = detectMods([arquivo(['META-INF/mods.toml'], FORGE_MANIFEST)]);
    expect(mod?.displayName).toBe('Just Enough Items');
    expect(mod?.version).toBe('15.2.0.27');
  });

  it('um manifesto que não se entende deixa o modo sem nome', () => {
    const [mod] = detectMods([arquivo(['fabric.mod.json'], '{ isto não é json')]);
    expect(mod?.loader).toBe('fabric');
    expect(mod?.displayName).toBeNull();
    expect(mod?.version).toBeNull();
  });

  it('um arquivo sem conteúdo lido fica sem nome', () => {
    const [mod] = detectMods([arquivo(['fabric.mod.json'])]);
    expect(mod?.displayName).toBeNull();
  });
});

describe('summarizeMods', () => {
  it('conta por carregador e diz quantos são desconhecidos', () => {
    const modos = detectMods([
      arquivo(['fabric.mod.json']),
      arquivo(['fabric.mod.json']),
      arquivo(['quilt.mod.json']),
      arquivo(['META-INF/mods.toml']),
      arquivo(['META-INF/MANIFEST.MF']),
    ]);
    const resumo = summarizeMods(modos);
    expect(resumo.total).toBe(5);
    expect(resumo.byLoader.get('fabric')).toBe(2);
    expect(resumo.byLoader.get('quilt')).toBe(1);
    expect(resumo.byLoader.get('forge')).toBe(1);
    // O desconhecido conta no total — um total que o escondesse mentiria.
    expect(resumo.unknown).toBe(1);
    expect(resumo.totalBytes).toBe(5_000);
  });

  it('uma pasta vazia dá zeros (não um número inventado)', () => {
    expect(summarizeMods([])).toEqual({
      total: 0,
      byLoader: new Map(),
      unknown: 0,
      totalBytes: 0,
    });
  });
});

describe('loaderLabelKey', () => {
  it('dá a chave de tradução de cada carregador', () => {
    expect(loaderLabelKey('fabric')).toBe('mods.loader.fabric');
    expect(loaderLabelKey('neoforge')).toBe('mods.loader.neoforge');
    expect(loaderLabelKey('unknown')).toBe('mods.loader.unknown');
  });
});