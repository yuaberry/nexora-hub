import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

/**
 * Senha — hash scrypt com salt aleatório por conta.
 *
 * Duas contas com a mesma senha produzem hashes diferentes. A verificação é
 * em **tempo constante** (`timingSafeEqual`): o tempo de resposta não pode
 * dizer quantos bytes acertaram.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: string,
  keylen: number,
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Par de hash e salt de uma senha. */
export interface PasswordRecord {
  hash: string;
  salt: string;
}

/** Gera hash e salt da senha. */
export async function hashPassword(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return { hash: derived.toString('hex'), salt };
}

/**
 * Verifica a senha em tempo constante.
 *
 * `timingSafeEqual` exige buffers do mesmo tamanho; um registo corrompido é
 * tratado como inválido em vez de derrubar a aplicação.
 */
export async function verifyPassword(
  password: string,
  record: PasswordRecord,
): Promise<boolean> {
  const expected = Buffer.from(record.hash, 'hex');
  if (expected.length !== KEY_LENGTH) {
    return false;
  }
  const derived = await scrypt(password, record.salt, KEY_LENGTH);
  return timingSafeEqual(expected, derived);
}