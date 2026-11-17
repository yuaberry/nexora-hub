import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Token de renovação (opaco, derivado).
 *
 * Formato `id.hmac`: o `id` identifica a sessão (um UUID) e o `hmac` é
 * `HMAC-SHA256(AUTH_SECRET, "refresh:" + id)` — o que prova que o token foi
 * emitido pelo servidor. A base de dados **não contém segredos**: um dump não
 * dá acesso a nenhuma sessão, e o servidor consegue **reemitir** o token a
 * partir do `id` — é o que a janela de tolerância da rotação precisa.
 */

/** Prefixo do HMAC: separa o domínio do token de qualquer outro uso da chave. */
const HMAC_CONTEXT = 'refresh:';

/**
 * Formato do id de sessão (UUID).
 *
 * A validação não é decorativa: o id vai para a consulta à base de dados, e o
 * PostgreSQL rejeita um `uuid` malformado com um **erro** — que o cliente
 * veria como `500` em vez de `401`. O token tem de ser recusado antes de
 * chegar à base de dados.
 */
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Emite o token de renovação de uma sessão. */
export function deriveRefreshToken(sessionId: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(`${HMAC_CONTEXT}${sessionId}`).digest('base64url');
  return `${sessionId}.${mac}`;
}

/**
 * Extrai o `id` de um token, **verificando** a assinatura.
 *
 * Devolve `undefined` quando o token está malformado, o id não é um UUID ou a
 * assinatura não bate. A resposta da rota é **uniforme** — token desconhecido,
 * adulterado, expirado ou revogado dão o mesmo `401` com a mesma mensagem:
 * um atacante não distingue "token errado" de "token roubado".
 */
export function verifyRefreshToken(token: string, secret: string): string | undefined {
  const separator = token.indexOf('.');
  if (separator <= 0 || separator === token.length - 1) {
    return undefined;
  }

  const sessionId = token.slice(0, separator);
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return undefined;
  }

  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(
    createHmac('sha256', secret).update(`${HMAC_CONTEXT}${sessionId}`).digest('base64url'),
  );

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return undefined;
  }
  return sessionId;
}