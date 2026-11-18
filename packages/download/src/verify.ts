/**
 * Verificação da integridade de ficheiros **instalados**.
 *
 * A segurança de um launcher não vem de confiar numa fonte — vem de poder
 * verificar o que está no disco. Esta função recalcula o SHA-256 dos
 * ficheiros que um manifesto declara e compara com o que o manifesto dizia:
 *
 * - um ficheiro alterado (corrompido, substituído, infectado depois de
 *   instalado) **falha** a verificação;
 * - um ficheiro em falta falha, com o motivo;
 * - um ficheiro sem checksum declarado é `unknown` — não se mente sobre o
 *   que não se pode verificar.
 *
 * Serve para qualquer fonte, legal ou não: a checagem é do ficheiro, não da
 * origem.
 */

import { sha256OfFile, timingSafeEqualHex } from './checksum.js';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';

/** Um ficheiro declarado por um manifesto, para verificar. */
export interface VerifiableFile {
  readonly path: string;
  readonly sha256?: string;
}

/** Resultado da verificação de um ficheiro. */
export interface FileVerification {
  readonly path: string;
  readonly status: 'verified' | 'mismatch' | 'missing' | 'unknown';
  /** SHA-256 medido (quando o ficheiro existe). */
  readonly actual: string | null;
  /** SHA-256 declarado pelo manifesto. */
  readonly expected: string | null;
}

/** Resultado agregado da verificação de uma instalação. */
export interface InstallVerification {
  readonly files: readonly FileVerification[];
  /** `true` quando todos os ficheiros verificáveis passaram. */
  readonly ok: boolean;
  /** Número de ficheiros verificados com sucesso. */
  readonly verifiedCount: number;
}

/** Verifica os ficheiros de uma instalação contra o manifesto. */
export async function verifyInstall(
  files: readonly VerifiableFile[],
  installFolder: string,
): Promise<InstallVerification> {
  const results: FileVerification[] = [];

  for (const file of files) {
    const fullPath = join(installFolder, file.path);

    if (file.sha256 === undefined) {
      results.push({ path: file.path, status: 'unknown', actual: null, expected: null });
      continue;
    }

    const exists = await fileExists(fullPath);
    if (!exists) {
      results.push({ path: file.path, status: 'missing', actual: null, expected: file.sha256 });
      continue;
    }

    const actual = await sha256OfFile(fullPath);
    const matches = timingSafeEqualHex(actual, file.sha256.toLowerCase());
    results.push({
      path: file.path,
      status: matches ? 'verified' : 'mismatch',
      actual,
      expected: file.sha256,
    });
  }

  const verifiable = results.filter((result) => result.status !== 'unknown');
  const verifiedCount = results.filter((result) => result.status === 'verified').length;

  return {
    files: results,
    // Só há falha quando um ficheiro **verificável** falha: um `unknown` não
    // pode reprovar uma instalação que não declarou checksum.
    ok: verifiable.length > 0 && verifiable.every((result) => result.status === 'verified'),
    verifiedCount,
  };
}

/** `true` quando um caminho existe e é ficheiro. */
async function fileExists(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}