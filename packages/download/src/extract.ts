/**
 * Extracção automática de arquivos transferidos.
 *
 * A regra que manda: **só se extrai o que foi verificado**. A extracção corre
 * depois do checksum passar, para a pasta do jogo, e o arquivo desaparece só
 * quando a extracção teve sucesso — um arquivo que ficou é a prova do que
 * aconteceu.
 *
 * Sem ferramenta no sistema (unzip, tar), a extracção é **recusada com
 * motivo**: prometer extracção onde ela não existe seria mentir.
 */

import { execFile } from 'node:child_process';
import { rm, stat } from 'node:fs/promises';

/** Métodos de extracção suportados. */
export type ExtractMethod = 'zip' | 'tar.gz';

/** Plano de extracção (função pura — testada sem tocar no disco). */
export interface ExtractPlan {
  /** Comando a correr (`unzip` ou `tar`). */
  readonly command: string;
  /** Argumentos do comando. */
  readonly args: readonly string[];
}

/**
 * Plano de extracção por método.
 *
 * `tar.gz`: `tar -xzf <arquivo> -C <destino>`. `zip`: `unzip -o <arquivo> -d
 * <destino>` (o `-o` substitui sem perguntar — a interacção não cabe num
 * launcher).
 */
export function planExtraction(archivePath: string, targetDir: string, method: ExtractMethod): ExtractPlan {
  if (method === 'tar.gz') {
    return { command: 'tar', args: ['-xzf', archivePath, '-C', targetDir] };
  }
  return { command: 'unzip', args: ['-o', archivePath, '-d', targetDir] };
}

/** Resultado da extracção. */
export type ExtractResult =
  | { readonly ok: true; readonly archiveRemoved: boolean }
  | { readonly ok: false; readonly reasonKey: 'tool-missing' | 'failed'; readonly reason: string };

/**
 * Extrai um arquivo para a pasta de destino.
 *
 * O arquivo é apagado **só** quando a extracção teve sucesso — e a remoção é
 * a última coisa a acontecer.
 */
export async function extractArchive(
  archivePath: string,
  targetDir: string,
  method: ExtractMethod,
  exec: typeof execFile = execFile,
): Promise<ExtractResult> {
  if (!(await fileExists(archivePath))) {
    return { ok: false, reasonKey: 'failed', reason: `Arquivo não encontrado: ${archivePath}` };
  }

  const plan = planExtraction(archivePath, targetDir, method);
  const outcome = await runExtraction(plan, exec);
  if (!outcome.ok) {
    if (outcome.reasonKey === 'ENOENT') {
      return {
        ok: false,
        reasonKey: 'tool-missing',
        reason: `Ferramenta '${plan.command}' não encontrada: instale-a para extrair ${method}.`,
      };
    }
    return { ok: false, reasonKey: 'failed', reason: outcome.reason };
  }

  await rm(archivePath, { force: true });
  return { ok: true, archiveRemoved: true };
}

/** Corre o comando do plano (prometedor, com o resultado tipado). */
function runExtraction(
  plan: ExtractPlan,
  exec: typeof execFile,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reasonKey: string; readonly reason: string }> {
  return new Promise((resolve) => {
    exec(plan.command, [...plan.args], (error) => {
      if (error === null || error === undefined) {
        resolve({ ok: true });
        return;
      }
      const code = (error as NodeJS.ErrnoException).code ?? 'UNKNOWN';
      resolve({ ok: false, reasonKey: code, reason: error.message });
    });
  });
}

/** `true` quando um caminho existe. */
async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}