import { describe, expect, it } from 'vitest';
import {
  SourceRegistry,
  demoManifest,
  validateManifest,
  type SourceManifest,
} from '../src/index.js';

/**
 * Sistema de fontes.
 *
 * O que estes testes travam: **nenhum manifesto sem attestation legal entra**
 * (a fronteira de responsabilidade), um catálogo de várias fontes unifica sem
 * duplicar, e a pesquisa é a mesma da biblioteca (alias e consoantes).
 */

/** Manifesto mínimo válido (base legal declarada). */
function validManifest(id: string, games: readonly unknown[]): Record<string, unknown> {
  return {
    schemaVersion: 1,
    id,
    name: `Fonte ${id}`,
    description: 'Fonte de teste.',
    legal: {
      basis: 'Conteúdo de teste do próprio operador.',
      attestedBy: 'Yua Devs',
      attestedAt: '2026-11-18T00:00:00.000Z',
    },
    games,
  };
}

/** Jogo mínimo válido. */
function game(id: string, title: string, aliases: readonly string[] = []): Record<string, unknown> {
  return {
    id,
    title,
    aliases,
    files: [{ url: 'http://127.0.0.1:8080/ficheiro.bin', path: 'ficheiro.bin', transport: 'http' }],
    executables: ['ficheiro.bin'],
  };
}

describe('validateManifest', () => {
  it('aceita um manifesto completo e com attestation', () => {
    const result = validateManifest(validManifest('op/fonte', [game('g1', 'Jogo Um')]));
    expect(result.ok).toBe(true);
  });

  it('recusa um manifesto sem base legal declarada', () => {
    const withoutLegal = validManifest('op/fonte', [game('g1', 'Jogo Um')]) as Record<string, unknown>;
    delete withoutLegal['legal'];
    const result = validateManifest(withoutLegal);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.join(' ')).toContain('legal');
    }
  });

  it('recusa um jogo sem ficheiros', () => {
    const broken = game('g1', 'Jogo Um') as Record<string, unknown>;
    delete broken['files'];
    expect(validateManifest(validManifest('op/fonte', [broken])).ok).toBe(false);
  });

  it('recusa um jogo sem executável declarado', () => {
    const broken = game('g1', 'Jogo Um') as Record<string, unknown>;
    delete broken['executables'];
    expect(validateManifest(validManifest('op/fonte', [broken])).ok).toBe(false);
  });

  it('recusa um checksum mal formado', () => {
    const broken = game('g1', 'Jogo Um') as Record<string, unknown>;
    broken['files'] = [{ url: 'http://127.0.0.1/x', path: 'x', sha256: 'NAO-E-HASH' }];
    expect(validateManifest(validManifest('op/fonte', [broken])).ok).toBe(false);
  });

  it('recusa um id de fonte fora do formato operador/fonte', () => {
    expect(validateManifest(validManifest('Fonte Maiúscula', [game('g1', 'X')])).ok).toBe(false);
  });

  it('recusa um id de jogo com barra (id unificado ambíguo)', () => {
    expect(validateManifest(validManifest('op/fonte', [game('a/b', 'X')])).ok).toBe(false);
  });
});

describe('SourceRegistry', () => {
  it('instala um manifesto e unifica o catálogo', () => {
    const registry = new SourceRegistry();
    const result = registry.install(validManifest('op/um', [game('g1', 'League Of Legends', ['lol'])]), 'ficheiro.json');
    expect(result.ok).toBe(true);
    expect(registry.catalog()).toHaveLength(1);
    expect(registry.catalog()[0]?.id).toBe('op/um/g1');
    expect(registry.catalog()[0]?.available).toBe(true);
  });

  it('recusa attestation em falta e não instala nada', () => {
    const registry = new SourceRegistry();
    const raw = validManifest('op/sem', [game('g1', 'X')]) as Record<string, unknown>;
    delete raw['legal'];
    const result = registry.install(raw, 'ficheiro.json');
    expect(result.ok).toBe(false);
    expect(registry.catalog()).toHaveLength(0);
  });

  it('recusa uma fonte com id repetido', () => {
    const registry = new SourceRegistry();
    registry.install(validManifest('op/rep', [game('g1', 'X')]), 'a.json');
    const second = registry.install(validManifest('op/rep', [game('g2', 'Y')]), 'b.json');
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.issues.join(' ')).toContain('já instalada');
    }
  });

  it('marca um jogo só-torrent como indisponível', () => {
    const registry = new SourceRegistry();
    const torrentGame = {
      id: 'g1',
      title: 'Jogo Torrent',
      files: [{ url: 'magnet:?xt=urn:btih:abc', path: 'jogo', transport: 'torrent' }],
      executables: ['jogo'],
    };
    registry.install(validManifest('op/torrent', [torrentGame]), 'a.json');
    expect(registry.catalog()[0]?.available).toBe(false);
  });

  it('pesquisa o catálogo unificado com alias e consoantes', () => {
    const registry = new SourceRegistry();
    registry.install(validManifest('op/um', [game('g1', 'League Of Legends', ['lol', 'league'])]), 'a.json');
    registry.install(validManifest('op/dois', [game('g2', 'Minecraft Java', ['mc'])]), 'b.json');

    const byAlias = registry.search('lol');
    expect(byAlias[0]?.game.title).toBe('League Of Legends');

    const byConsonants = registry.search('mncft');
    expect(byConsonants[0]?.game.title).toBe('Minecraft Java');

    const byPrefix = registry.search('l');
    expect(byPrefix[0]?.game.title).toBe('League Of Legends');
  });

  it('encontra um jogo pelo identificador unificado', () => {
    const registry = new SourceRegistry();
    registry.install(validManifest('op/um', [game('g1', 'Jogo Um')]), 'a.json');
    expect(registry.game('op/um/g1')?.title).toBe('Jogo Um');
    expect(registry.game('op/outro/g1')).toBeNull();
    expect(registry.game('invalido')).toBeNull();
  });

  it('remove uma fonte e limpa o catálogo', () => {
    const registry = new SourceRegistry();
    registry.install(validManifest('op/um', [game('g1', 'X')]), 'a.json');
    expect(registry.remove('op/um')).toBe(true);
    expect(registry.catalog()).toHaveLength(0);
  });
});

describe('demoManifest', () => {
  it('é um manifesto válido (prova o ciclo completo nos testes)', () => {
    const result = validateManifest(demoManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.manifest as SourceManifest).games).toHaveLength(1);
    }
  });
});