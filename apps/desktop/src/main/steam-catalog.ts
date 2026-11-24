/**
 * Catálogo público da Steam — busca e detalhes, no processo principal.
 *
 * Duas perguntas do utilizador, respondidas pela loja pública:
 *
 * - **"que jogo é este AppID?"** — os detalhes do app (nome, tipo, gratuito,
 *   e as DLCs que declara);
 * - **"procura por nome"** — a busca da loja, para encontrar o AppID.
 *
 * A rede **nunca** instala nada: o que sai daqui são metadados. A entrada
 * nova na biblioteca fica marcada como não instalada, e a instalação continua
 * a ser feita pela loja oficial — a NEXORA não hospeda nem move ficheiros de
 * jogos. Epíc e GOG não têm aqui lugar: não há formato local verificado para
 * as suas ferramentas em Linux (ver `official-import.ts`).
 *
 * O `fetch` é injectável: os testes correm sem rede, com respostas fixadas.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  isSteamAppId,
  parseSteamLibraryFolders,
  steamAppFromDetails,
  steamAppsFromSearch,
  steamShortDescription,
  type SteamAppSummary,
} from '@nexora/core';
import { steamRoots } from './official-import.js';

/** Base da API pública da loja. */
const STORE_API = 'https://store.steampowered.com/api';

/** Limites honestos: a loja responde devagar e não se precisa de mais. */
const TIMEOUT_MS = 8000;
const MAX_SEARCH_RESULTS = 25;
const MAX_DLC_LOOKUPS = 25;

/** Um fetch de JSON (injectável nos testes). */
export type JsonFetch = (url: string, timeoutMs: number) => Promise<unknown>;

/** O fetch real: com tempo limite e sem cookies (a loja não precisa). */
async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Loja respondeu ${response.status}.`);
  }
  return response.json();
}

/** Os detalhes de um app, ou `null` se a loja não o conhece. */
export async function lookupSteamApp(
  appId: string,
  fetch: JsonFetch = fetchJson,
): Promise<SteamAppSummary | null> {
  if (!isSteamAppId(appId)) {
    return null;
  }
  const url = `${STORE_API}/appdetails?appids=${appId}&cc=br&l=pt`;
  return steamAppFromDetails(await fetch(url, TIMEOUT_MS));
}

/** A busca por nome (no máximo `MAX_SEARCH_RESULTS` resultados). */
export async function searchSteamApps(
  term: string,
  fetch: JsonFetch = fetchJson,
): Promise<readonly SteamAppSummary[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) {
    return [];
  }
  const url = `${STORE_API}/storesearch/?term=${encodeURIComponent(trimmed)}&l=pt&cc=br`;
  return steamAppsFromSearch(await fetch(url, TIMEOUT_MS)).slice(0, MAX_SEARCH_RESULTS);
}

/** O que a busca de DLCs devolve. */
export interface SteamDlcResult {
  readonly items: readonly SteamAppSummary[];
  /** Quantos nomes ficaram por ler (o limite da loja foi atingido). */
  readonly truncated: number;
}

/**
 * As DLCs **declaradas** por um jogo na loja, com os nomes.
 *
 * Um pedido traz os IDs das DLCs; cada nome precisa do seu próprio pedido —
 * por isso há um limite por chamada, e a interface diz quantas ficaram de
 * fora em vez de fingir uma lista completa. Quais estão no disco não é
 * perguntada aqui: quem chama cruza com o que está instalado.
 */
export async function lookupSteamDlcs(
  appId: string,
  fetch: JsonFetch = fetchJson,
): Promise<SteamDlcResult> {
  const game = await lookupSteamApp(appId, fetch);
  if (game === null) {
    return { items: [], truncated: 0 };
  }
  const ids = game.dlcAppIds;
  const items: SteamAppSummary[] = [];
  for (const id of ids.slice(0, MAX_DLC_LOOKUPS)) {
    const dlc = await lookupSteamApp(String(id), fetch).catch(() => null);
    // Um nome que a loja não dá fica de fora — nunca inventado — e o resto
    // da lista continua útil. Melhor uma DLC sem nome que nenhuma lista.
    if (dlc !== null) {
      items.push(dlc);
    }
  }
  return { items, truncated: Math.max(0, ids.length - MAX_DLC_LOOKUPS) };
}

/**
 * A descrição curta de um jogo, em texto simples.
 *
 * O mesmo pedido dos detalhes, lido para outra pergunta. `null` quando a loja
 * não conhece o app ou não dá descrição.
 */
export async function lookupSteamDescription(
  appId: string,
  fetch: JsonFetch = fetchJson,
): Promise<string | null> {
  if (!isSteamAppId(appId)) {
    return null;
  }
  const url = `${STORE_API}/appdetails?appids=${appId}&cc=br&l=pt`;
  return steamShortDescription(await fetch(url, TIMEOUT_MS));
}

/** Os appids instalados no disco (todas as bibliotecas da Steam).
 *
 * Lido do `libraryfolders.vdf`: é o mesmo ficheiro que a importação usa, e
 * responde à única pergunta que importa aqui — "este app está no disco?" —
 * sem depender da rede.
 */
export function installedSteamAppIds(roots: readonly string[] = steamRoots()): ReadonlySet<string> {
  const installed = new Set<string>();
  for (const root of roots) {
    let text: string;
    try {
      text = readFileSync(join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8');
    } catch {
      continue;
    }
    try {
      for (const library of parseSteamLibraryFolders(text)) {
        for (const appId of library.appIds) {
          installed.add(appId);
        }
      }
    } catch {
      // ficheiro temporário/partido: a biblioteca seguinte pode responder
    }
  }
  return installed;
}