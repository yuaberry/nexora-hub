import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import type { IncomingMessage } from 'node:http';

/**
 * Reencaminhamento da API pelo processo principal.
 *
 * O pedido nasce no **processo principal**, por isso não há CORS: `Origin` e
 * `Referer` são removidos antes de sair, e o pedido não parece vir de nenhum
 * browser. O `Authorization` é reencaminhado — o token nunca vai na *query
 * string*.
 *
 * Quando a API está inacessível, o proxy **não** devolve uma resposta vazia:
 * devolve `502` com o envelope de erro do contrato.
 */

/** Resultado do reencaminhamento. */
export interface ProxyResult {
  readonly statusCode: number;
  readonly body: string;
  readonly headers: Record<string, string>;
}

/** Envelope de erro do contrato (o mesmo da API). */
function unavailableEnvelope(): ProxyResult {
  return {
    statusCode: 502,
    body: JSON.stringify({
      error: {
        code: 'service_unavailable',
        message: 'Serviço temporariamente indisponível.',
        requestId: '-',
      },
    }),
    headers: { 'content-type': 'application/json' },
  };
}

/** Reencaminha um pedido para a base da API. */
export function forwardToApi(
  baseUrl: string,
  pathWithQuery: string,
  method: string,
  headers: Record<string, string | string[] | undefined>,
  body: string | undefined,
): Promise<ProxyResult> {
  return new Promise((resolve) => {
    let url: URL;
    try {
      url = new URL(baseUrl + pathWithQuery);
    } catch {
      resolve(unavailableEnvelope());
      return;
    }

    const client = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = client(
      url,
      {
        method,
        headers: sanitizedHeaders(headers, url),
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode ?? 502,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: filteredHeaders(response.headers),
          });
        });
      },
    );

    upstream.on('error', () => {
      resolve(unavailableEnvelope());
    });

    if (body !== undefined && body !== '') {
      // O comprimento do corpo é **obrigatório**: sem `content-length` (e sem
      // `transfer-encoding: chunked`), o servidor não sabe onde o corpo
      // acaba — e o Fastify devolve-o como texto em vez de o parsear como
      // JSON. A prova ao vivo apanhou isto: um POST com corpo chegava à API
      // como *string*, e a validação falhava com "payload inválido".
      const length = Buffer.byteLength(body);
      upstream.setHeader('content-length', length);
      upstream.write(body);
    }
    upstream.end();
  });
}

/**
 * Cabeçalhos do pedido reencaminhado.
 *
 * `origin` e `referer` são **removidos**: é assim que o CORS desaparece por
 * construção. O `host` passa a ser o da API.
 */
export function sanitizedHeaders(
  headers: Record<string, string | string[] | undefined>,
  url: URL,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'origin' || lower === 'referer' || lower === 'host' || lower === 'connection') {
      continue;
    }
    if (typeof value === 'string') {
      result[lower] = value;
    } else if (Array.isArray(value)) {
      result[lower] = value.join(', ');
    }
  }
  result['host'] = url.host;
  return result;
}

/** Cabeçalhos da resposta que voltam ao renderer. */
export function filteredHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (lower === 'content-encoding' || lower === 'transfer-encoding' || lower === 'connection') {
      continue;
    }
    if (typeof value === 'string') {
      result[lower] = value;
    } else if (Array.isArray(value)) {
      result[lower] = value.join(', ');
    }
  }
  return result;
}

/** `true` quando o caminho é um caminho de API (a reencaminhar). */
export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}