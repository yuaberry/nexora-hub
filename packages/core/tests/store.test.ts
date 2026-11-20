import { describe, expect, it } from 'vitest';
import { STORE_CATALOG } from '../src/store/catalog.js';
import { filterStore, hasStoreLink, primaryLink } from '../src/store/filters.js';

/**
 * Directório da loja.
 *
 * O que estes testes travam: o filtro adulto esconde por omissão, o filtro de
 * plataforma só devolve o que corre nela, e toda a entrada tem pelo menos uma
 * ligação de compra **válida** (URL absoluta) — um directório sem ligação não
 * serve para nada.
 */

describe('STORE_CATALOG', () => {
  it('toda a entrada tem ligação de compra com URL absoluta', () => {
    for (const game of STORE_CATALOG) {
      expect(game.links.length).toBeGreaterThan(0);
      for (const link of game.links) {
        expect(link.url.startsWith('https://')).toBe(true);
      }
    }
  });

  it('toda a entrada tem plataformas', () => {
    for (const game of STORE_CATALOG) {
      expect(game.platforms.length).toBeGreaterThan(0);
    }
  });
});

describe('filterStore', () => {
  it('esconde conteúdo adulto por omissão', () => {
    const withAdult = [
      ...STORE_CATALOG,
      { ...STORE_CATALOG[0]!, id: 'adulto', title: 'Jogo Adulto', adult: true },
    ];
    expect(filterStore(withAdult, { query: 'adulto' })).toHaveLength(0);
    expect(filterStore(withAdult, { query: 'adulto', hideAdult: false })).toHaveLength(1);
  });

  it('filtra por plataforma', () => {
    const linux = filterStore(STORE_CATALOG, { platform: 'linux' });
    expect(linux.every((game) => game.platforms.includes('linux'))).toBe(true);
    expect(linux.length).toBeLessThan(STORE_CATALOG.length);
  });

  it('pesquisa por título, alias e etiqueta', () => {
    expect(filterStore(STORE_CATALOG, { query: 'league' })[0]?.id).toBe('league-of-legends');
    expect(filterStore(STORE_CATALOG, { query: 'lol' })[0]?.id).toBe('league-of-legends');
    expect(filterStore(STORE_CATALOG, { query: 'sandbox' }).length).toBeGreaterThan(0);
  });

  it('respeita o limite', () => {
    expect(filterStore(STORE_CATALOG, { limit: 2 })).toHaveLength(2);
  });
});

describe('hasStoreLink / primaryLink', () => {
  it('encontra a loja certa', () => {
    const cyberpunk = STORE_CATALOG.find((game) => game.id === 'cyberpunk-2077')!;
    expect(hasStoreLink(cyberpunk, 'steam')).toBe(true);
    expect(hasStoreLink(cyberpunk, 'epic')).toBe(false);
  });

  it('devolve a primeira ligação', () => {
    const game = STORE_CATALOG.find((entry) => entry.id === 'hollow-knight')!;
    expect(primaryLink(game)?.store).toBe('steam');
  });
});
