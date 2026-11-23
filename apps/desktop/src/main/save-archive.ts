/**
 * Arquivo de saves — empacotar e despachar com a ferramenta do sistema.
 *
 * Um save é uma pasta; a nuvem guarda um **arquivo**. A compressão e o
 * formato são do `tar` (GZip), a mesma ferramenta que o projecto já usa para
 * ler ficheiros de manifests — sem dependência nova a compilar, e presente no
 * Linux, no macOS e no Windows 10+ (`bsdtar` como `tar.exe`).
 *
 * Duas operações, nenhuma adivinha: criar um arquivo de uma pasta (o ponto de
 * entrada é a própria pasta, para o arquivo não levar caminhos absolutos), e
 * extrair um arquivo para uma pasta. O que falha devolve o motivo — nunca um
 * arquivo vazio a fingir sucesso.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);

/** O maior arquivo aceite (o mesmo limite do servidor). */
export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;

/**
 * Cria o arquivo (`tar.gz`) de uma pasta de saves.
 *
 * `.` como caminho dentro da pasta: o arquivo guarda os ficheiros, não o
 * caminho do computador de quem o criou. Extrair noutra máquina devolve a
 * mesma árvore.
 */
export async function createArchive(folder: string): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync('tar', ['-czf', '-', '-C', folder, '.'], {
      maxBuffer: MAX_ARCHIVE_BYTES,
      encoding: 'buffer',
    });
    return stdout.length === 0 ? null : stdout;
  } catch {
    // pasta inexistente, disco cheio, `tar` ausente: nenhum arquivo nasce
    return null;
  }
}

/**
 * Extrai um arquivo para uma pasta.
 *
 * A pasta é criada se não existir. Extrair por cima de ficheiros existentes é
 * o comportamento normal de uma restauração — quem restaura sabe o que faz, e
 * o launcher cria um snapshot local **antes** (ver `save-cloud.ts`).
 *
 * O arquivo passa por um ficheiro temporário em vez do stdin: o `tar` a ler
 * da entrada padrão pendura-se neste contexto (a prova ao vivo apanhou o
 * teste a exceder o tempo), e um ficheiro temporário é explícito e limpo.
 */
export async function extractArchive(bytes: Uint8Array, target: string): Promise<boolean> {
  const temp = await mkdtempSync(join(tmpdir(), 'nexora-archive-in-'));
  const file = join(temp, 'save.tar.gz');
  try {
    await writeFile(file, bytes);
    await execFileAsync('tar', ['-xzf', file, '-C', target], { maxBuffer: MAX_ARCHIVE_BYTES });
    return true;
  } catch {
    // arquivo inválido, pasta inexistente, disco cheio: nada é extraído
    return false;
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}