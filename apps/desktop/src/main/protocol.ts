import { protocol, type Session } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { APP_SCHEME, type DesktopConfig } from './config.js';
import { forwardToApi, isApiPath } from './proxy.js';

/**
 * Esquema interno `nexora://`.
 *
 * Registado como privilegiado (`standard`, `secure`, `supportFetchAPI`)
 * **antes** de `app.ready`. O renderer nunca fala com a rede directamente:
 *
 * - `/api/*` é reencaminhado pelo processo principal para a API configurada;
 * - o resto serve o renderer compilado, com *fallback* para `index.html`
 *   (as rotas da interface são resolvidas pela própria interface);
 * - um caminho que tenta sair da raiz é recusado (`403`) — o serviço de
 *   ficheiros nunca serve travessia de caminho.
 */

/** Tipos MIME servidos pelo esquema (lista fechada). */
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * CSP aplicada a **toda** resposta do esquema — a mesma do `index.html` da
 * web, servida pelo próprio protocolo.
 *
 * `style-src 'unsafe-inline'` existe porque os componentes usam estilo
 * *inline* (a percentagem da barra de armazenamento); `script-src 'self'`
 * mantém a proibição de script inline — não há excepção a essa.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
].join('; ');

/** Regista o esquema interno da aplicação. */
export function registerNexoraProtocol(config: DesktopConfig, _session?: Session): void {
  // O esquema regista-se pelo **nome** (`nexora`), sem `://`: com o sufixo o
  // handler não casa com o esquema do pedido e a navegação é abortada
  // (ERR_ABORTED) — a janela fica branca, sem erro visível.
  protocol.handle(APP_SCHEME, async (req) => {
    const url = new URL(req.url);
    const pathname = decodeURIComponent(url.pathname);

    if (isApiPath(pathname)) {
      const body = await readBody(req);
      const result = await forwardToApi(
        config.apiBaseUrl,
        `${pathname}${url.search}`,
        req.method,
        headersToRecord(req.headers),
        body,
      );
      return toResponse(result.statusCode, result.headers, result.body, true);
    }

    return serveStatic(config, pathname);
  });
}

/** Lê o corpo de um pedido reencaminhado. */
async function readBody(req: Request): Promise<string | undefined> {
  try {
    return await req.text();
  } catch {
    return undefined;
  }
}

/**
 * Converte os cabeçalhos Web (`Headers`) num registo simples.
 *
 * O reencaminhamento usa o módulo `node:http`, que espera um registo — e é o
 * `proxy.ts` que remove `Origin`/`Referer` antes de sair.
 */
function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

/** Converte o resultado do reencaminhamento numa resposta do protocolo. */
function toResponse(
  statusCode: number,
  headers: Record<string, string>,
  body: string,
  proxied = false,
): Response {
  // A CSP só é injetada nas respostas do renderer: numa resposta da API ela
  // não tem sentido (o renderer nunca a interpreta como documento).
  const finalHeaders: Record<string, string> = proxied
    ? headers
    : { ...headers, 'content-security-policy': CONTENT_SECURITY_POLICY };
  return new Response(body, { status: statusCode, headers: finalHeaders });
}

/** Serve um ficheiro do renderer, com *fallback* SPA. */
async function serveStatic(config: DesktopConfig, pathname: string): Promise<Response> {
  const requested = resolveStaticPath(config.rendererRoot, pathname);
  if (requested === null) {
    return new Response('Forbidden', { status: 403 });
  }

  const file = await readIfExists(requested);
  if (file !== null) {
    return new Response(new Uint8Array(file.content), {
      status: 200,
      headers: {
        'content-type': MIME_TYPES[extname(requested)] ?? 'application/octet-stream',
        'content-security-policy': CONTENT_SECURITY_POLICY,
      },
    });
  }

  // Fallback SPA: a interface resolve o caminho.
  const fallback = await readIfExists(join(config.rendererRoot, 'index.html'));
  if (fallback === null) {
    return new Response('Not Found', { status: 404 });
  }
  return new Response(new Uint8Array(fallback.content), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': CONTENT_SECURITY_POLICY },
  });
}

/**
 * Resolve um caminho pedido dentro da raiz do renderer.
 *
 * Duas defesas, de propósito: um caminho que **tenta** sair da raiz
 * (`..`) é recusado por princípio — não é preciso confiar na normalização
 * para descobrir que era perigoso — e o resultado é verificado contra a raiz
 * depois de resolvido. O esquema recusa em vez de servir.
 */
export function resolveStaticPath(root: string, pathname: string): string | null {
  const decoded = pathname;
  if (decoded.split(/[/\\]/).includes('..')) {
    return null;
  }
  const target = resolve(join(root, decoded));
  const relativePath = relative(resolve(root), target);
  if (relativePath.startsWith('..') || relativePath.startsWith('/')) {
    return null;
  }
  return target;
}

/** Lê um ficheiro se existir. */
async function readIfExists(path: string): Promise<{ content: Buffer } | null> {
  try {
    const content = await readFile(path);
    return { content };
  } catch {
    return null;
  }
}