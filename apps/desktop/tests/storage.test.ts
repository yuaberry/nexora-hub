import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MAX_FILES_PER_FOLDER, directorySize, volumeSpace } from '../src/main/storage.js';

/**
 * Uso de disco.
 *
 * O que estes testes travam: a soma é real (bytes escritos no disco) e o
 * limite declarado é respeitado — uma pasta com mais ficheiros que o limite
 * devolve uma estimativa limitada, não um launcher pendurado.
 */
describe('directorySize', () => {
  it('soma recursivamente o conteúdo da pasta', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-storage-'));
    writeFileSync(join(dir, 'a.bin'), Buffer.alloc(1_000));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'sub', 'b.bin'), Buffer.alloc(2_000));
    expect(directorySize(dir)).toBe(3_000);
  });

  it('respeita o limite de ficheiros', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-storage-'));
    for (let index = 0; index < 10; index += 1) {
      writeFileSync(join(dir, `f${index}.bin`), Buffer.alloc(100));
    }
    expect(directorySize(dir, 5)).toBe(500);
    expect(directorySize(dir)).toBe(1_000);
  });

  it('ignora ficheiros ilegíveis sem interromper a contagem', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-storage-'));
    writeFileSync(join(dir, 'ok.bin'), Buffer.alloc(100));
    expect(directorySize(dir)).toBe(100);
  });

  it('limite por omissão é o declarado', () => {
    expect(MAX_FILES_PER_FOLDER).toBe(50_000);
  });
});

describe('volumeSpace', () => {
  it('mede o volume do directório temporário', () => {
    const volume = volumeSpace(tmpdir());
    expect(volume.totalBytes).toBeGreaterThan(0);
    expect(volume.freeBytes).toBeGreaterThanOrEqual(0);
  });

  it('devolve zero para um caminho inexistente', () => {
    const volume = volumeSpace('/caminino/que/nao/existe/em/lado/nenhum');
    expect(volume.totalBytes).toBe(0);
  });
});