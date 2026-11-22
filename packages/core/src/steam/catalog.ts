/**
 * Catálogo público da Steam — o que a loja devolve, em tipos do domínio.
 *
 * A NEXORA não vende nem hospedeia nada: estas funções leêm as respostas
 * **públicas** da loja (`appdetails` e `storesearch`) e traduzem-nas para
 * tipos nossos. O utilizador usa-as para encontrar um jogo pelo **AppID** ou
 * pelo nome e trazer o título, a capa e o link da loja para a biblioteca
 * local — nada é instalado sem estar no disco do próprio utilizador.
 *
 * Tudo aqui é puro: os guardas de formato não tocam na rede, e os mapeadores
 * são testados com respostas reais fixadas (fixtures).
 */

/** Resumo de um app da Steam (jogo, DLC, demo…). */
export interface SteamAppSummary {
  /** Appid, sempre em dígitos (`"3241660"`). */
  readonly appId: string;
  readonly title: string;
  /** O campo `type` da loja: `game`, `dlc`, `demo`, `advertising`… */
  readonly kind: string;
  /** Entrada gratuita (preço zero). */
  readonly free: boolean;
  /** IDs das DLCs que o app declara (vazio quando não declara). */
  readonly dlcAppIds: readonly string[];
  /** URL da imagem de capa (cdn.akamai.steamstatic, padrão público). */
  readonly coverUrl: string;
  /** URL da página da loja. */
  readonly storeUrl: string;
}

/** Uma DLC conhecida (nome da loja) e se está no disco do utilizador. */
export interface SteamDlcEntry {
  readonly appId: string;
  readonly title: string;
  readonly kind: string;
  readonly free: boolean;
}

/**
 * URL da imagem pública de um app.
 *
 * `https://cdn.akamai.steamstatic.com/steam/apps/<appid>/header.jpg` é o
 * padrão de imagens que a própria Steam usa nas suas lojas: não precisa de
 * chave, não expira, e uma origem única manter a CSP curta.
 */
export function steamCapsuleUrl(appId: string): string {
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

/** URL da página da loja de um app. */
export function steamStoreUrl(appId: string): string {
  return `https://store.steampowered.com/app/${appId}`;
}

/** Um appid é um número positivo em dígitos — nunca um nome nem um URL. */
export function isSteamAppId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,12}$/.test(value);
}

/** Lê um campo de texto de um objecto desconhecido (ou `null`). */
function stringField(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value !== '' ? value : null;
}

/** Lê um campo booleano de um objecto desconhecido (ou `false`). */
function booleanField(source: Record<string, unknown>, key: string): boolean {
  return source[key] === true;
}

/**
 * Lê o appid de um objecto desconhecido.
 *
 * A loja escreve `steam_appid` como **número** (confirmação: a resposta real
 * de `appdetails`), e a busca (`storesearch`) como `id` numérico também. Um
 * appid em texto é aceite na mesma — os dois chegaml ao mesmo domínio.
 */
function appIdField(source: Record<string, unknown>): string | null {
  const value = source['steam_appid'] ?? source['id'];
  if (typeof value === 'number' && Number.isInteger(value) && value > 0 && isSteamAppId(String(value))) {
    return String(value);
  }
  if (typeof value === 'string' && isSteamAppId(value)) {
    return value;
  }
  return null;
}

/** Lê uma lista de números (IDs) de um objecto desconhecido. */
function numberList(source: Record<string, unknown>, key: string): readonly number[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isInteger(item));
}

/**
 * Traduz a resposta de `appdetails` de um único app.
 *
 * Devolve `null` quando a loja não conhece o app (`success: false` — um
 * appid inventado, uma app adulta sem sessão, ou conteúdo retirado): quem
 * chama mostra o motivo, não finge uma entrada.
 */
export function steamAppFromDetails(payload: unknown): SteamAppSummary | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const entry = Object.values(payload as Record<string, unknown>)[0];
  if (typeof entry !== 'object' || entry === null) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  if (record['success'] !== true) {
    return null;
  }
  const data = record['data'];
  if (typeof data !== 'object' || data === null) {
    return null;
  }
  const app = data as Record<string, unknown>;
  const appId = appIdField(app);
  if (appId === null) {
    return null;
  }
  return {
    appId,
    title: stringField(app, 'name') ?? `App ${appId}`,
    kind: stringField(app, 'type') ?? 'unknown',
    free: booleanField(app, 'is_free'),
    dlcAppIds: numberList(app, 'dlc').map((id) => String(id)),
    coverUrl: steamCapsuleUrl(appId),
    storeUrl: steamStoreUrl(appId),
  };
}

/**
 * Traduz a resposta de `storesearch` (a busca por nome).
 *
 * A busca não devolve o campo `is_free`: um item com preço inicial zero é
 * tratado como gratuito, o resto fica com o preço real na loja.
 */
export function steamAppsFromSearch(payload: unknown): readonly SteamAppSummary[] {
  if (typeof payload !== 'object' || payload === null) {
    return [];
  }
  const items = (payload as Record<string, unknown>)['items'];
  if (!Array.isArray(items)) {
    return [];
  }
  const summaries: SteamAppSummary[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const app = item as Record<string, unknown>;
    const id = app['id'];
    if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
      continue;
    }
    const appId = String(id);
    const price = app['price'];
    const initial = typeof price === 'object' && price !== null
      ? (price as Record<string, unknown>)['initial']
      : null;
    summaries.push({
      appId,
      title: stringField(app, 'name') ?? `App ${appId}`,
      kind: stringField(app, 'type') ?? 'app',
      free: initial === 0,
      dlcAppIds: [],
      coverUrl: steamCapsuleUrl(appId),
      storeUrl: steamStoreUrl(appId),
    });
  }
  return summaries;
}