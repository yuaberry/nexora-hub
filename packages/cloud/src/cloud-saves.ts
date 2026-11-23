/**
 * Cliente dos saves na nuvem — o contrato com a API da NEXORA.
 *
 * Quatro operações, todas atrás de sessão: enviar uma versão, listar as
 * minhas, descarregar uma e apagar uma. O conteúdo é um arquivo (`tar.gz`):
 * o cliente só sabe montá-lo e desmontá-lo; o que está dentro é do jogo.
 *
 * Tudo aqui é puro e injectável: os testes correm com um `fetch` falso, sem
 * rede. A validação é à mão (como no resto do núcleo) — o que vem da rede é
 * tratado como entrada externa, nunca como tipo conhecido.
 */

/** Uma versão de save guardada na nuvem. */
export interface CloudSaveEntry {
  readonly id: string;
  readonly gameKey: string;
  readonly label: string;
  readonly checksum: string;
  readonly sizeBytes: number;
  readonly revision: number;
  readonly createdAt: string;
}

/** Resposta mínima de rede (o que o `fetch` real dá). */
export interface SaveResponse {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
}

/** Um fetch injectável (a forma do `fetch` global). */
export type SaveFetch = (url: string, init: {
  method?: string;
  headers?: Readonly<Record<string, string>>;
  body?: Uint8Array;
}) => Promise<SaveResponse>;

/** Cabeçalhos com o token de sessão. */
function auth(token: string, extra: Readonly<Record<string, string>> = {}): Record<string, string> {
  return { authorization: `Bearer ${token}`, ...extra };
}

/** Lê um campo de texto de um objecto desconhecido (ou `null`). */
function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' ? value : null;
}

/** Lê um número de um objecto desconhecido (ou 0). */
function num(source: Record<string, unknown>, key: string): number {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Traduz uma entrada única (a resposta do envio é `{ save: … }`, não uma
 * lista).
 */
function entryFromPayload(payload: unknown): CloudSaveEntry | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const save = (payload as Record<string, unknown>)['save'];
  if (typeof save !== 'object' || save === null) {
    return null;
  }
  const record = save as Record<string, unknown>;
  const id = text(record, 'id');
  return id === null
    ? null
    : {
        id,
        gameKey: text(record, 'gameKey') ?? '',
        label: text(record, 'label') ?? 'Snapshot',
        checksum: text(record, 'checksum') ?? '',
        sizeBytes: num(record, 'sizeBytes'),
        revision: num(record, 'revision'),
        createdAt: text(record, 'createdAt') ?? '',
      };
}

/**
 * Traduz a resposta de listagem.
 *
 * Uma resposta que não tem aforma esperada devolve lista vazia — quem chama
 * mostra o erro da rede, não um save inventado.
 */
export function entriesFromList(payload: unknown): readonly CloudSaveEntry[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const items = (payload as Record<string, unknown>)['items'];
  if (!Array.isArray(items)) {
    return [];
  }
  const entries: CloudSaveEntry[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const save = item as Record<string, unknown>;
    const id = text(save, 'id');
    if (id === null) {
      continue;
    }
    entries.push({
      id,
      gameKey: text(save, 'gameKey') ?? '',
      label: text(save, 'label') ?? 'Snapshot',
      checksum: text(save, 'checksum') ?? '',
      sizeBytes: num(save, 'sizeBytes'),
      revision: num(save, 'revision'),
      createdAt: text(save, 'createdAt') ?? '',
    });
  }
  return entries;
}

/** Resultado de uma operação (o erro vem da rede, não inventado). */
export type SaveResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly status: number };

/** Envia uma versão nova (o arquivo é o corpo). */
export async function uploadSave(
  baseUrl: string,
  token: string,
  input: {
    readonly gameKey: string;
    readonly label: string;
    readonly checksum: string;
    readonly bytes: Uint8Array;
    /** A revisão da cópia local — a história viaja com o save. */
    readonly revision: number;
  },
  fetch: SaveFetch,
): Promise<SaveResult<CloudSaveEntry>> {
  const response = await fetch(`${baseUrl}/api/v1/saves`, {
    method: 'POST',
    headers: auth(token, {
      'content-type': 'application/gzip',
      'x-game-key': input.gameKey,
      'x-save-label': input.label,
      'x-save-checksum': input.checksum,
      'x-save-revision': String(input.revision),
    }),
    body: input.bytes,
  });
  if (response.status !== 201) {
    return { ok: false, status: response.status };
  }
  const entry = entryFromPayload(await response.json());
  return entry === null ? { ok: false, status: response.status } : { ok: true, value: entry };
}

/** Lista as minhas versões (de um jogo, quando pedido). */
export async function listSaves(
  baseUrl: string,
  token: string,
  gameKey: string | null,
  fetch: SaveFetch,
): Promise<SaveResult<readonly CloudSaveEntry[]>> {
  const query = gameKey === null ? '' : `?game=${encodeURIComponent(gameKey)}`;
  const response = await fetch(`${baseUrl}/api/v1/saves${query}`, { headers: auth(token) });
  if (response.status !== 200) {
    return { ok: false, status: response.status };
  }
  return { ok: true, value: entriesFromList(await response.json()) };
}

/** Descarrega uma versão (os bytes e os metadados do cabeçalho). */
export async function downloadSave(
  baseUrl: string,
  token: string,
  id: string,
  fetch: SaveFetch,
): Promise<SaveResult<{ readonly bytes: Uint8Array; readonly revision: number; readonly checksum: string }>> {
  const response = await fetch(`${baseUrl}/api/v1/saves/${encodeURIComponent(id)}`, { headers: auth(token) });
  if (response.status !== 200) {
    return { ok: false, status: response.status };
  }
  const revision = Number(response.headers.get('x-save-revision') ?? '0');
  const checksum = response.headers.get('x-save-checksum') ?? '';
  return { ok: true, value: { bytes: new Uint8Array(await response.arrayBuffer()), revision, checksum } };
}

/** Apaga uma versão. */
export async function deleteSave(
  baseUrl: string,
  token: string,
  id: string,
  fetch: SaveFetch,
): Promise<SaveResult<true>> {
  const response = await fetch(`${baseUrl}/api/v1/saves/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: auth(token),
  });
  return response.status === 200 ? { ok: true, value: true } : { ok: false, status: response.status };
}