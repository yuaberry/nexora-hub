import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifra simétrica de segredos em repouso (AES-256-GCM + HKDF).
 *
 * Espelho do Nexora Cloud, com **contexto próprio** (`nexora-hub-mfa:`): o
 * mesmo contexto nunca é reutilizado noutro domínio — a chave do launcher não
 * abre um segredo da plataforma de nuvem, nem o contrário.
 *
 * - **AEAD**: o GCM dá confidencialidade e integridade (`authTag`);
 * - **HKDF**: a chave de cifra é derivada de `AUTH_SECRET`, nunca reutilizando
 *   a chave de assinatura dos tokens;
 * - **rotação de `AUTH_SECRET` invalida os segredos cifrados** — consequência
 *   assumida: com a rotação, os utilizadores têm de voltar a registar o
 *   autenticador.
 *
 * Quando existir um KMS, esta é a fronteira a substituir: o formato
 * (`v1.<iv>.<tag>.<ciphertext>`) permite a troca sem mudar a base de dados.
 */

/** Contexto de derivação (salt e info fixos por contexto). */
export interface SecretContext {
  readonly label: string;
  readonly salt: string;
  readonly info: string;
}

/** Contexto do segredo TOTP do MFA (próprio do HUB). */
export const MFA_SECRET_CONTEXT: SecretContext = {
  label: 'nexora-hub-mfa',
  salt: 'nexora-hub-mfa',
  info: 'mfa:',
};

/** Versão do formato — permite migrar o formato no futuro. */
const FORMAT_VERSION = 'v1';

/** Tamanho do IV (96 bits, o recomendado para o GCM). */
const IV_BYTES = 12;

/** Deriva a chave de cifra a partir do segredo da plataforma. */
function deriveKey(secret: string, context: SecretContext): Buffer {
  const key = hkdfSync(
    'sha256',
    Buffer.from(secret, 'utf8'),
    Buffer.from(context.salt),
    Buffer.from(context.info),
    32,
  );
  return Buffer.from(key);
}

/** Cifra um segredo. Formato: `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export function encryptSecret(
  plaintext: string,
  secret: string,
  context: SecretContext = MFA_SECRET_CONTEXT,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(secret, context), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

/**
 * Decifra um segredo.
 *
 * Devolve `undefined` quando o texto não é um formato válido, quando a
 * assinatura GCM não bate (o texto foi alterado) ou quando a chave mudou.
 */
export function decryptSecret(
  payload: string,
  secret: string,
  context: SecretContext = MFA_SECRET_CONTEXT,
): string | undefined {
  const parts = payload.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  const [version, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
  if (version !== FORMAT_VERSION) {
    return undefined;
  }

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      deriveKey(secret, context),
      Buffer.from(ivPart, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64url')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    // A assinatura GCM não bate: o texto foi alterado ou a chave rodou.
    return undefined;
  }
}