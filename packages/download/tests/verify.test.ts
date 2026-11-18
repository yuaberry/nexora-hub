import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyInstall } from '../src/index.js';

/**
 * Verificação de ficheiros instalados.
 *
 * A medida de segurança que o launcher oferece — para **qualquer** fonte — é
 * poder recalcular o que está no disco e comparar com o que o manifesto
 * declarou. Estes testes provam os quatro estados: verificado, divergente,
 * em falta e desconhecido (sem checksum, a verdade é dita).
 */

/** Conteúdo de prova e o seu SHA-256. */
const ORIGINAL = Buffer.from('conteudo original do jogo', 'binary');
const ORIGINAL_SHA = createHash('sha256').update(ORIGINAL).digest('hex');
const TAMPERED = Buffer.from('conteudo ALTERADO (virus?)', 'binary');

/** Pasta de instalação de prova. */
function installFolder(): string {
  return mkdtempSync(join(tmpdir(), 'nexora-verify-'));
}

describe('verifyInstall', () => {
  it('verifica uma instalação intacta', async () => {
    const folder = installFolder();
    writeFileSync(join(folder, 'jogo.sh'), ORIGINAL);
    try {
      const result = await verifyInstall([{ path: 'jogo.sh', sha256: ORIGINAL_SHA }], folder);
      expect(result.ok).toBe(true);
      expect(result.verifiedCount).toBe(1);
      expect(result.files[0]?.status).toBe('verified');
    } finally {
      rmSync(folder, { force: true, recursive: true });
    }
  });

  it('detecta um ficheiro alterado após a instalação', async () => {
    const folder = installFolder();
    writeFileSync(join(folder, 'jogo.sh'), TAMPERED);
    try {
      const result = await verifyInstall([{ path: 'jogo.sh', sha256: ORIGINAL_SHA }], folder);
      expect(result.ok).toBe(false);
      expect(result.files[0]?.status).toBe('mismatch');
      expect(result.files[0]?.actual).not.toBe(result.files[0]?.expected);
    } finally {
      rmSync(folder, { force: true, recursive: true });
    }
  });

  it('detecta um ficheiro em falta', async () => {
    const folder = installFolder();
    try {
      const result = await verifyInstall([{ path: 'desapareceu.bin', sha256: ORIGINAL_SHA }], folder);
      expect(result.ok).toBe(false);
      expect(result.files[0]?.status).toBe('missing');
    } finally {
      rmSync(folder, { force: true, recursive: true });
    }
  });

  it('um ficheiro sem checksum é desconhecido, não aprovado', async () => {
    const folder = installFolder();
    writeFileSync(join(folder, 'jogo.sh'), ORIGINAL);
    try {
      const result = await verifyInstall([{ path: 'jogo.sh' }], folder);
      expect(result.files[0]?.status).toBe('unknown');
      // Sem nada verificável, a instalação não pode ser declarada íntegra.
      expect(result.ok).toBe(false);
    } finally {
      rmSync(folder, { force: true, recursive: true });
    }
  });

  it('uma instalação com vários ficheiros falha se um falhar', async () => {
    const folder = installFolder();
    writeFileSync(join(folder, 'a.bin'), ORIGINAL);
    writeFileSync(join(folder, 'b.bin'), TAMPERED);
    try {
      const result = await verifyInstall(
        [
          { path: 'a.bin', sha256: ORIGINAL_SHA },
          { path: 'b.bin', sha256: ORIGINAL_SHA },
        ],
        folder,
      );
      expect(result.ok).toBe(false);
      expect(result.verifiedCount).toBe(1);
    } finally {
      rmSync(folder, { force: true, recursive: true });
    }
  });
});