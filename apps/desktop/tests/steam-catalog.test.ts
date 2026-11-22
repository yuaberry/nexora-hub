import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  installedSteamAppIds,
  lookupSteamApp,
  lookupSteamDlcs,
  searchSteamApps,
  type JsonFetch,
} from '../src/main/steam-catalog.js';

/**
 * Catálogo da Steam — os pedidos com rede falsa.
 *
 * O `fetch` é injectável: estes testes fixam respostas (no formato real da
 * loja) e provam as três perguntas — os detalhes de um AppID, a busca por
 * nome e as DLCs — mais a leitura dos manifestos instalados, sem tocar em
 * rede nem no Steam do utilizador.
 */

/** Resposta real (recorte) de `appdetails` para o Hollow Knight. */
const DETAILS_367520 = {
  '367520': {
    success: true,
    data: { type: 'game', name: 'Hollow Knight', steam_appid: 367520, is_free: false, dlc: [598190, 916000] },
  },
};

/** Resposta real (recorte) de `appdetails` para uma DLC. */
const DETAILS_598190 = {
  '598190': {
    success: true,
    data: { type: 'dlc', name: 'Hollow Knight: Godmaster', steam_appid: 598190, is_free: true },
  },
};

/** Um fetch que responde por URL (o mapa de respostas fixadas). */
function fetchByUrl(responses: Record<string, unknown>): JsonFetch {
  return async (url: string) => {
    for (const [fragment, payload] of Object.entries(responses)) {
      if (url.includes(fragment)) {
        return payload;
      }
    }
    throw new Error(`pedido inesperado: ${url}`);
  };
}

/** Um fetch que falha sempre (a loja inacessível). */
const failingFetch: JsonFetch = async () => {
  throw new Error('sem rede');
};

describe('lookupSteamApp', () => {
  it('traduz os detalhes do AppID', async () => {
    const fetch = fetchByUrl({ 'appids=367520': DETAILS_367520 });
    const app = await lookupSteamApp('367520', fetch);
    expect(app?.title).toBe('Hollow Knight');
    expect(app?.dlcAppIds).toEqual(['598190', '916000']);
  });

  it('recusa um appid que não é número', async () => {
    const app = await lookupSteamApp('hollow-knight', fetchByUrl({}));
    expect(app).toBeNull();
  });

  it('devolve null quando a loja não conhece o app', async () => {
    const fetch = fetchByUrl({ 'appids=999999999': { '999999999': { success: false } } });
    expect(await lookupSteamApp('999999999', fetch)).toBeNull();
  });

  it('propaga a falha de rede (quem chama mostra o motivo)', async () => {
    await expect(lookupSteamApp('367520', failingFetch)).rejects.toThrow('sem rede');
  });
});

describe('searchSteamApps', () => {
  it('traduz os resultados da busca', async () => {
    const fetch = fetchByUrl({
      'storesearch': {
        total: 1,
        items: [{ type: 'app', name: 'Hollow Knight', id: 367520, price: { initial: 4699, final: 4699 } }],
      },
    });
    const items = await searchSteamApps('hollow', fetch);
    expect(items).toHaveLength(1);
    expect(items[0]?.appId).toBe('367520');
  });

  it('um termo curto não chega a pedir nada', async () => {
    expect(await searchSteamApps('a', failingFetch)).toEqual([]);
  });
});

describe('lookupSteamDlcs', () => {
  it('lê os nomes das DLCs declaradas', async () => {
    const fetch = fetchByUrl({
      'appids=367520': DETAILS_367520,
      'appids=598190': DETAILS_598190,
      'appids=916000': { '916000': { success: true, data: { type: 'dlc', name: 'Hollow Knight: Lifeblood', steam_appid: 916000, is_free: true } } },
    });
    const result = await lookupSteamDlcs('367520', fetch);
    expect(result.items.map((dlc) => dlc.title)).toEqual([
      'Hollow Knight: Godmaster',
      'Hollow Knight: Lifeblood',
    ]);
    expect(result.truncated).toBe(0);
  });

  it('um jogo que a loja não conhece não tem DLCs', async () => {
    const fetch = fetchByUrl({ 'appids=999': { '999': { success: false } } });
    expect(await lookupSteamDlcs('999', fetch)).toEqual({ items: [], truncated: 0 });
  });

  it('uma DLC que a loja não responde é saltada (não inventada)', async () => {
    const fetch = fetchByUrl({
      'appids=367520': DETAILS_367520,
      'appids=598190': DETAILS_598190,
      // 916000 não responde: o fetch levanta erro e a lista fica com uma.
    });
    const result = await lookupSteamDlcs('367520', fetch);
    expect(result.items).toHaveLength(1);
  });
});

describe('installedSteamAppIds', () => {
  it('lê os appids de todas as bibliotecas declaradas', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-steam-'));
    const root = join(dir, 'Steam');
    mkdirSync(join(root, 'steamapps'), { recursive: true });
    writeFileSync(
      join(root, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders"
{
  "0"
  {
    "path" "${root}"
    "apps"
    {
      "367520"		"5231995691"
      "3241660"		"1126132800"
    }
  }
}`,
    );
    const installed = installedSteamAppIds([root]);
    expect(installed.has('367520')).toBe(true);
    expect(installed.has('3241660')).toBe(true);
    expect(installed.has('730')).toBe(false);
  });

  it('uma raiz sem libraryfolders não parte o resto', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-steam-empty-'));
    expect(installedSteamAppIds([dir]).size).toBe(0);
  });
});