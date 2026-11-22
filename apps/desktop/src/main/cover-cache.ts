/**
 * Cache das capas da loja — do `https` para o disco do utilizador.
 *
 * Uma entrada de catálogo nasce com a URL da cápsula pública da Steam. Mas o
 * renderer não consegue carregar essa imagem: a rede do Chromium é limitada
 * pela CSP, e a Akamai recusa o *user-agent* do Electron (a prova ao vivo
 * apanhou isto — a imagem vinha a zeros). O processo principal, esse, fala
 * com a Internet sem restrições.
 *
 * Duas razões para guardar no disco em vez de servir directo:
 *
 * 1. a imagem passa a vir pelo mesmo caminho das capas da Steam (o esquema
 *    interno `nexora://cover/`), com as mesmas regras de enquadramento;
 * 2. a biblioteca continua completa **offline** — a segunda vez que a página
 *    abre, a cápsula já é um ficheiro local.
 *
 * A falha é honesta: sem imagem, a entrada fica com a URL e o placeholder do
 * tema desenha-se (o `GameImage` trata do resto).
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

/** Tipos de imagem aceites (a resposta da loja diz qual é). */
const CONTENT_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/** Um user-agent de browser — a Akamai recusa o do Electron. */
const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

/** Busca de bytes (injectável nos testes). */
export type BytesFetch = (url: string) => Promise<{ readonly bytes: Uint8Array; readonly contentType: string | null } | null>;

/** O fetch real, com user-agent de browser e tempo limite. */
async function fetchBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: 'image/*', 'user-agent': BROWSER_USER_AGENT },
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get('content-type');
    return { bytes: new Uint8Array(await response.arrayBuffer()), contentType };
  } catch {
    return null;
  }
}

/**
 * Guarda uma cápsula da loja no cache e devolve o caminho local.
 *
 * O nome do ficheiro é o *hash* do URL: o mesmo endereço dá sempre o mesmo
 * ficheiro (duas entradas do mesmo jogo partilham a cópia), e nenhum nome é
 * inventado a partir do conteúdo. `null` quando a loja não dá imagem — quem
 * chama fica com a URL e o placeholder.
 */
export async function cacheRemoteCover(
  url: string,
  cacheDir: string,
  fetch: BytesFetch = fetchBytes,
): Promise<string | null> {
  const result = await fetch(url);
  if (result === null || result.bytes.byteLength === 0) {
    return null;
  }
  const extension = result.contentType === null ? null : CONTENT_TYPES[result.contentType.split(';')[0]?.trim() ?? ''];
  if (extension === undefined) {
    // Não é imagem: não se guarda nem se serve.
    return null;
  }
  const name = createHash('sha256').update(url).digest('hex').slice(0, 32) + extension;
  const path = join(cacheDir, name);
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path, result.bytes);
  } catch {
    // Disco cheio ou sem permissão: a capa remota fica como está.
    return null;
  }
  return path;
}

/** Pasta do cache das capas (ao lado da base de dados local). */
export function coverCacheDir(databasePath: string): string {
  return join(dirname(databasePath), 'cover-cache');
}