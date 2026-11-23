import { describe, expect, it, beforeEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createArchive, extractArchive } from '../src/main/save-archive.js';

/**
 * Arquivo de saves — ida e volta com a ferramenta do sistema.
 *
 * O que estes testes travam: uma pasta empacotada e extraída noutra devolve
 * **os mesmos bytes** (o arquivo é um transporte, não um transformador), o
 * arquivo não guarda o caminho do computador de origem (o ponto de entrada é
 * a pasta), e o que falha devolve o motivo — nunca um arquivo vazio.
 */
describe('save-archive', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-archive-'));
  });

  it('empacota uma pasta com subpastas e ficheiros', async () => {
    const source = join(dir, 'saves');
    mkdirSync(join(source, 'nivel1'), { recursive: true });
    writeFileSync(join(source, 'player.sav'), 'progresso-1');
    writeFileSync(join(source, 'nivel1', 'mundo.sav'), 'mundo-1');

    const archive = await createArchive(source);
    expect(archive).not.toBeNull();
    expect((archive ?? new Uint8Array()).byteLength).toBeGreaterThan(0);

    const target = join(dir, 'restaurado');
    mkdirSync(target, { recursive: true });
    const ok = await extractArchive(archive ?? new Uint8Array(), target);
    expect(ok).toBe(true);
    expect(readFileSync(join(target, 'player.sav'), 'utf8')).toBe('progresso-1');
    expect(readFileSync(join(target, 'nivel1', 'mundo.sav'), 'utf8')).toBe('mundo-1');
  });

  it('uma pasta que não existe não cria arquivo', async () => {
    expect(await createArchive(join(dir, 'nao-existe'))).toBeNull();
  });

  it('extrair lixo devolve falso (não sucesso fingido)', async () => {
    mkdirSync(join(dir, 'vazio'), { recursive: true });
    expect(await extractArchive(new Uint8Array([1, 2, 3]), join(dir, 'vazio'))).toBe(false);
  });
});
