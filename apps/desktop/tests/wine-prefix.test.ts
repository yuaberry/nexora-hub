import { describe, expect, it, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureWinePrefix } from '../src/main/wine-prefix.js';

/**
 * Prefixo Wine — a pasta que o spawn não cria.
 *
 * O que este teste trava: a pasta do prefixo existe depois de preparada, com
 * os pais (o caminho tem vários níveis), e preparar duas vezes não destrói o
 * que já lá estava — a configuração do utilizador sobrevive a um segundo
 * arranque.
 */
describe('ensureWinePrefix', () => {
  const created: string[] = [];

  afterEach(() => {
    for (const dir of created.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('cria a pasta e os pais', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexora-prefixo-'));
    created.push(root);
    const prefix = join(root, 'wine-prefixes', 'meu-jogo');
    ensureWinePrefix(prefix);
    expect(existsSync(prefix)).toBe(true);
  });

  it('preparar duas vezes mantém o que lá estava', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexora-prefixo-'));
    created.push(root);
    const prefix = join(root, 'wine-prefixes', 'meu-jogo');
    ensureWinePrefix(prefix);
    writeFileSync(join(prefix, 'system.reg'), '# configuração do utilizador');
    ensureWinePrefix(prefix);
    expect(existsSync(join(prefix, 'system.reg'))).toBe(true);
  });
});
