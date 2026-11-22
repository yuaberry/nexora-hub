import { describe, expect, it } from 'vitest';
import {
  isSteamAppId,
  steamAppFromDetails,
  steamAppsFromSearch,
  steamCapsuleUrl,
  steamStoreUrl,
} from '../../src/steam/catalog.js';

/**
 * Catálogo público da Steam — os mapeadores contra respostas reais.
 *
 * As fixtures são recortes de respostas verdadeiras da loja (AppID 367520,
 * o Hollow Knight, com as suas duas DLCs): a forma que a loja devolve é o
 * contrato, e contrato que muda parte código — estes testes apanham a
 * mudança antes do utilizador.
 */

/** Resposta de `appdetails` para um jogo com DLCs (recorte real). */
const DETAILS_WITH_DLC = {
  '367520': {
    success: true,
    data: {
      type: 'game',
      name: 'Hollow Knight',
      steam_appid: 367520,
      is_free: false,
      dlc: [598190, 916000],
    },
  },
};

/** Resposta de `storesearch` para "hollow knight" (recorte real). */
const SEARCH_PAGE = {
  total: 5,
  items: [
    {
      type: 'app',
      name: 'Hollow Knight',
      id: 367520,
      price: { currency: 'BRL', initial: 4699, final: 4699 },
      tiny_image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/367520/capsule_231x87.jpg',
    },
    {
      type: 'app',
      name: 'Um Jogo Gratuito',
      id: 730,
      price: { currency: 'BRL', initial: 0, final: 0 },
      tiny_image: '',
    },
  ],
};

describe('steamAppFromDetails', () => {
  it('traduz os detalhes de um jogo com DLCs', () => {
    const app = steamAppFromDetails(DETAILS_WITH_DLC);
    expect(app).not.toBeNull();
    expect(app?.appId).toBe('367520');
    expect(app?.title).toBe('Hollow Knight');
    expect(app?.kind).toBe('game');
    expect(app?.free).toBe(false);
    expect(app?.dlcAppIds).toEqual(['598190', '916000']);
    expect(app?.coverUrl).toBe(steamCapsuleUrl('367520'));
    expect(app?.storeUrl).toBe(steamStoreUrl('367520'));
  });

  it('devolve null quando a loja não conhece o app', () => {
    expect(steamAppFromDetails({ '999999999': { success: false } })).toBeNull();
  });

  it('devolve null para respostas partidas (sem dados ou sem appid)', () => {
    expect(steamAppFromDetails({})).toBeNull();
    expect(steamAppFromDetails({ x: null })).toBeNull();
    expect(steamAppFromDetails({ x: { success: true } })).toBeNull();
    expect(steamAppFromDetails({ x: { success: true, data: { name: 'Sem AppID' } } })).toBeNull();
    expect(steamAppFromDetails('lixo')).toBeNull();
  });

  it('um app sem DLCs fica com lista vazia', () => {
    const app = steamAppFromDetails({
      '570': { success: true, data: { type: 'game', name: 'Dota 2', steam_appid: 570, is_free: true } },
    });
    expect(app?.dlcAppIds).toEqual([]);
    expect(app?.free).toBe(true);
  });
});

describe('steamAppsFromSearch', () => {
  it('traduz os resultados da busca', () => {
    const items = steamAppsFromSearch(SEARCH_PAGE);
    expect(items).toHaveLength(2);
    expect(items[0]?.appId).toBe('367520');
    expect(items[0]?.free).toBe(false);
    // A busca não devolve `is_free`: preço zero é gratuito, o resto pago.
    expect(items[1]?.free).toBe(true);
    // A busca não conhece as DLCs: a lista fica vazia (nunca inventada).
    expect(items[0]?.dlcAppIds).toEqual([]);
  });

  it('ignora itens sem id válido', () => {
    const items = steamAppsFromSearch({ items: [{ name: 'Sem ID' }, null, { id: -1, name: 'Negativo' }] });
    expect(items).toEqual([]);
  });

  it('resposta sem itens devolve lista vazia', () => {
    expect(steamAppsFromSearch({ total: 0 })).toEqual([]);
    expect(steamAppsFromSearch(null)).toEqual([]);
  });
});

describe('isSteamAppId', () => {
  it('aceita dígitos e recusa o resto', () => {
    expect(isSteamAppId('3241660')).toBe(true);
    expect(isSteamAppId('3241660123456')).toBe(false); // longo demais
    expect(isSteamAppId('')).toBe(false);
    expect(isSteamAppId('abc')).toBe(false);
    expect(isSteamAppId('-1')).toBe(false);
    expect(isSteamAppId(730)).toBe(false);
  });
});