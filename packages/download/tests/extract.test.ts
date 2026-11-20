import { describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractArchive, planExtraction } from '../src/index.js';
import type { ExtractMethod } from '../src/index.js';

/**
 * Extracção automática.
 *
 * O que estes testes travam: o plano é o correcto por método, um arquivo em
 * falta recusa, uma **ferramenta ausente** recusa com motivo (em vez de
 * prometer), e o arquivo desaparece só quando a extracção teve sucesso.
 */

/** Comando de prova que falha com um código de erro dados. */
function failingExec(code: string, message: string): typeof execFile {
  return ((_command: string, _args: readonly string[], callback: (error: Error | null) => void) => {
    const error = new Error(message) as NodeJS.ErrnoException;
    error.code = code;
    callback(error);
  }) as unknown as typeof execFile;
}

/** Comando de prova que tem sucesso. */
function okExec(): typeof execFile {
  return ((_command: string, _args: readonly string[], callback: (error: Error | null) => void) => {
    callback(null);
  }) as unknown as typeof execFile;
}

describe('planExtraction', () => {
  it('zip usa o unzip com -o (sem interacção)', () => {
    expect(planExtraction('/a/jogo.zip', '/jogos/x', 'zip')).toEqual({
      command: 'unzip',
      args: ['-o', '/a/jogo.zip', '-d', '/jogos/x'],
    });
  });

  it('tar.gz usa o tar com -C', () => {
    expect(planExtraction('/a/jogo.tar.gz', '/jogos/x', 'tar.gz')).toEqual({
      command: 'tar',
      args: ['-xzf', '/a/jogo.tar.gz', '-C', '/jogos/x'],
    });
  });
});

describe('extractArchive', () => {
  it('recusa um arquivo que não existe', async () => {
    const result = await extractArchive('/nao/existe.zip', '/tmp/x', 'zip', okExec());
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reasonKey).toBe('failed');
  });

  it('recusa com motivo quando a ferramenta não existe (ENOENT)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-extract-'));
    const archive = join(dir, 'jogo.zip');
    writeFileSync(archive, 'conteudo de prova');
    try {
      const result = await extractArchive(archive, dir, 'zip', failingExec('ENOENT', 'spawn unzip ENOENT'));
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.reasonKey).toBe('tool-missing');
      expect(result.reason).toContain('unzip');
      // O arquivo fica: é a prova do que aconteceu.
      const { existsSync } = await import('node:fs');
      expect(existsSync(archive)).toBe(true);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('apaga o arquivo quando a extracção tem sucesso', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-extract-'));
    const archive = join(dir, 'jogo.zip');
    writeFileSync(archive, 'conteudo de prova');
    try {
      const result = await extractArchive(archive, dir, 'zip', okExec());
      expect(result.ok).toBe(true);
      const { existsSync } = await import('node:fs');
      expect(existsSync(archive)).toBe(false);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('uma falha de extracção mantém o arquivo e diz o motivo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-extract-'));
    const archive = join(dir, 'jogo.zip');
    writeFileSync(archive, 'conteudo de prova');
    try {
      const result = await extractArchive(archive, dir, 'zip', failingExec('UNKNOWN', 'arquivo corrompido'));
      expect(result.ok).toBe(false);
      if (result.ok) {
        return;
      }
      expect(result.reasonKey).toBe('failed');
      const { existsSync } = await import('node:fs');
      expect(existsSync(archive)).toBe(true);
    } finally {
      rmSync(dir, { force: true, recursive: true });
    }
  });

  it('suporta os dois métodos declarados', () => {
    const methods: readonly ExtractMethod[] = ['zip', 'tar.gz'];
    expect(methods).toHaveLength(2);
  });
});