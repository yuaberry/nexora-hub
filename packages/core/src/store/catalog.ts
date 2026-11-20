/**
 * Directório de compras curado.
 *
 * Cada entrada aponta para **páginas oficiais** de lojas. O catálogo é pequeno
 * e curado à mão — cresce por lote, e uma entrada nova entra com o seu teste.
 * Preços são referências declaradas; sem preço, a interface não inventa um.
 */

import type { StoreGame } from './types.js';

/** O directório de compras. */
export const STORE_CATALOG: readonly StoreGame[] = [
  {
    id: 'league-of-legends',
    title: 'League of Legends',
    aliases: ['lol', 'league'],
    tagline: 'MOBA 5v5 da Riot Games — gratuito.',
    cover: null,
    platforms: ['windows', 'macos'],
    adult: false,
    tags: ['moba', 'multiplayer', 'competitivo'],
    links: [{ store: 'official', url: 'https://www.leagueoflegends.com/', price: 0, currency: 'USD' }],
  },
  {
    id: 'cyberpunk-2077',
    title: 'Cyberpunk 2077',
    aliases: ['cp2077', 'cyberpunk'],
    tagline: 'RPG de acção em mundo aberto da CD Projekt Red.',
    cover: null,
    platforms: ['windows'],
    adult: false,
    tags: ['rpg', 'mundo aberto', 'ficção científica'],
    links: [
      { store: 'steam', url: 'https://store.steampowered.com/app/1091500', price: 59.99, currency: 'USD' },
      { store: 'gog', url: 'https://www.gog.com/game/cyberpunk_2077', price: 59.99, currency: 'USD' },
    ],
  },
  {
    id: 'hollow-knight',
    title: 'Hollow Knight',
    aliases: ['hk'],
    tagline: 'Metroidvania aclamado da Team Cherry.',
    cover: null,
    platforms: ['windows', 'linux', 'macos'],
    adult: false,
    tags: ['metroidvania', 'plataforma', 'indie'],
    links: [
      { store: 'steam', url: 'https://store.steampowered.com/app/367520', price: 14.99, currency: 'USD' },
      { store: 'gog', url: 'https://www.gog.com/game/hollow_knight', price: 14.99, currency: 'USD' },
    ],
  },
  {
    id: 'terraria',
    title: 'Terraria',
    aliases: ['terraria'],
    tagline: 'Sandbox de aventura e construção da Re-Logic.',
    cover: null,
    platforms: ['windows', 'linux', 'macos'],
    adult: false,
    tags: ['sandbox', 'plataforma', 'coop'],
    links: [
      { store: 'steam', url: 'https://store.steampowered.com/app/105600', price: 9.99, currency: 'USD' },
      { store: 'gog', url: 'https://www.gog.com/game/terraria', price: 9.99, currency: 'USD' },
    ],
  },
  {
    id: 'stardew-valley',
    title: 'Stardew Valley',
    aliases: ['stardew', 'sdv'],
    tagline: 'Simulador de quinta da ConcernedApe.',
    cover: null,
    platforms: ['windows', 'linux', 'macos'],
    adult: false,
    tags: ['simulação', 'rpg', 'indie'],
    links: [
      { store: 'steam', url: 'https://store.steampowered.com/app/413150', price: 14.99, currency: 'USD' },
      { store: 'gog', url: 'https://www.gog.com/game/stardew_valley', price: 14.99, currency: 'USD' },
    ],
  },
];