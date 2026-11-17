import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP — Time-based One-Time Password (RFC 6238).
 *
 * Implementado com `node:crypto`, sem dependência externa — como o resto do
 * módulo de autenticação. Duas propriedades das quais a segurança depende:
 *
 * - **comparação em tempo constante**: o código é verificado com
 *   `timingSafeEqual`, para que o tempo de resposta não diga quantos dígitos
 *   acertaram;
 * - **anti-replay**: o passo aceite é registado, e um passo **igual ou
 *   anterior** é recusado. Sem isso, um código interceptado podia ser usado
 *   várias vezes dentro da mesma janela de 30 s.
 */

/** Alfabeto base32 (RFC 4648), sem padding. */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Duração de um passo, em segundos. */
export const TOTP_PERIOD_SECONDS = 30;

/** Número de dígitos do código. */
export const TOTP_DIGITS = 6;

/**
 * Passos admitidos em cada lado do passo actual.
 *
 * Um passo de tolerância de cada lado absorve o desvio do relógio entre o
 * servidor e o telefone — sem ele, um utilizador legítimo seria recusado por
 * segundos.
 */
export const TOTP_WINDOW = 1;

/** Tamanho do segredo, em bytes (160 bits — o recomendado pelo RFC 4226). */
const SECRET_BYTES = 20;

/** Codifica bytes em base32 (sem padding). */
export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of input) {
    value = ((value << 8) | byte) & 0xffffffff;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
      value &= (1 << bits) - 1;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31] ?? '';
  }
  return output;
}

/** Descodifica base32 (ignora maiúsculas, espaços e padding). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('Segredo base32 inválido.');
    }
    value = ((value << 5) | index) & 0xffffffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
      value &= (1 << bits) - 1;
    }
  }

  return Buffer.from(bytes);
}

/** Gera um segredo TOTP novo, em base32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Instante (passo) correspondente a uma data. */
export function totpStep(now: Date = new Date()): number {
  return Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
}

/**
 * Calcula o código TOTP de um passo.
 *
 * Segue a truncagem dinâmica do RFC 4226: o último byte do HMAC indica a
 * posição dos 4 bytes que formam o código.
 */
export function totpCode(secretBase32: string, step: number): string {
  const secret = base32Decode(secretBase32);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));

  const digest = createHmac('sha1', secret).update(counter).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);

  const modulus = 10 ** TOTP_DIGITS;
  return (binary % modulus).toString().padStart(TOTP_DIGITS, '0');
}

/** Resultado de uma verificação de código TOTP. */
export interface TotpVerification {
  valid: boolean;
  /** Passo aceite (para a protecção anti-replay). */
  step?: number;
}

/**
 * Verifica um código TOTP.
 *
 * Aceita o passo actual e os passos adjacentes (desvio de relógio). A
 * comparação é em **tempo constante** e o passo aceite é devolvido para que o
 * servidor o registe — e recuse a repetição do mesmo passo.
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  now: Date = new Date(),
  window: number = TOTP_WINDOW,
): TotpVerification {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    return { valid: false };
  }

  const current = totpStep(now);
  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + offset;
    const expected = totpCode(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return { valid: true, step };
    }
  }
  return { valid: false };
}

/**
 * URI de registo (`otpauth://`) para o autenticador.
 *
 * O formato é o standard de facto (Key Uri Format): o aplicador de
 * autenticação lê o segredo e passa a mostrar os códigos.
 */
export function totpUri(options: { secret: string; account: string; issuer: string }): string {
  const label = encodeURIComponent(`${options.issuer}:${options.account}`);
  const params = new URLSearchParams({
    secret: options.secret,
    issuer: options.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}