import { createHash, randomBytes } from 'node:crypto';

/**
 * Códigos de resgate do MFA.
 *
 * De uso único, e **só o hash é guardado** (SHA-256): um dump da base de dados
 * não permite resgatar uma conta. O código é mostrado uma única vez, na altura
 * em que é gerado — depois disso, só existe o hash.
 */

/** Número de códigos gerados por pedido. */
export const RECOVERY_CODE_COUNT = 8;

/** Comprimento de cada código (caracteres). */
const CODE_LENGTH = 10;

/**
 * Alfabeto sem caracteres ambíguos.
 *
 * `0`/`O`, `1`/`I`/`l` e `8`/`B` saem: um código que o utilizador não consegue
 * ler sem errar não é uma saída de emergência, é uma frustração.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Gera um código de resgate novo. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[(bytes[index] ?? 0) % ALPHABET.length];
  }
  return code;
}

/** Hash SHA-256 (hex) de um código. */
export function hashRecoveryCode(code: string): string {
  return createHash('sha256').update(code.trim().toLowerCase(), 'utf8').digest('hex');
}

/** Gera o conjunto de códigos e devolve o que mostrar e o que guardar. */
export function createRecoveryCodes(): {
  readonly shown: readonly string[];
  readonly hashes: readonly string[];
} {
  const shown: string[] = [];
  const hashes: string[] = [];
  for (let index = 0; index < RECOVERY_CODE_COUNT; index += 1) {
    const code = generateRecoveryCode();
    shown.push(code);
    hashes.push(hashRecoveryCode(code));
  }
  return { shown, hashes };
}