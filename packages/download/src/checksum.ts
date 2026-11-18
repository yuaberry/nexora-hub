/**
 * Verificação de integridade — fluxo, sem carregar o ficheiro para memória.
 *
 * Um jogo de 100 GB não pode ser lido para um `Buffer`: o checksum corre em
 * streaming, com o mesmo resultado que o esperado do manifesto. Um checksum
 * divergente **recusa** a instalação — é a fronteira entre "descarregou" e
 * "descarregou o que o manifesto dizia".
 */

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Calcula o SHA-256 de um ficheiro (hex minúsculo). */
export function sha256OfFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
  });
}

/** `true` quando o checksum do ficheiro corresponde ao esperado. */
export async function verifyFile(path: string, expectedHex: string): Promise<boolean> {
  const actual = await sha256OfFile(path);
  return timingSafeEqualHex(actual, expectedHex.trim().toLowerCase());
}

/**
 * Comparação de hex em tempo constante.
 *
 * O valor esperado vem de um manifesto — não é um segredo —, mas comparar em
 * tempo constante é o hábito correcto e custa nada.
 */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}