import type { Game } from '../types.js';

/**
 * Catálogo curado inicial.
 *
 * É uma **tabela de aliases**, não uma loja: identifica jogos que o utilizador
 * provavelmente tem instalados, para que a biblioteca os reconheça ao
 * importar uma pasta. Nenhum jogo é hospedado, redistribuído ou transferido
 * pela NEXORA — `cover` é sempre `null` nesta fase (a capa vem do ficheiro
 * local do utilizador ou do placeholder do tema; nunca é inventada).
 *
 * A tabela é curada **à mão** e cresce por lote: uma entrada nova entra com o
 * seu teste.
 */
export const CURATED_GAMES: readonly Game[] = [
  {
    id: 'league-of-legends',
    title: 'League of Legends',
    aliases: ['lol', 'league'],
    cover: null,
    provider: 'local',
    tags: ['moba', 'multiplayer'],
    adult: false,
  },
  {
    id: 'minecraft',
    title: 'Minecraft',
    aliases: ['mc', 'minecraft java', 'minecraft bedrock'],
    cover: null,
    provider: 'local',
    tags: ['sandbox', 'sobrevivência'],
    adult: false,
  },
  {
    id: 'terraria',
    title: 'Terraria',
    aliases: ['terraria 2d'],
    cover: null,
    provider: 'local',
    tags: ['sandbox', 'plataforma'],
    adult: false,
  },
  {
    id: 'valorant',
    title: 'VALORANT',
    aliases: ['val', 'valorant 2'],
    cover: null,
    provider: 'local',
    tags: ['fps', 'tático'],
    adult: false,
  },
  {
    id: 'counter-strike',
    title: 'Counter-Strike',
    aliases: ['cs', 'csgo', 'cs2', 'counter-strike 2', 'counter strike global offensive'],
    cover: null,
    provider: 'local',
    tags: ['fps', 'tático'],
    adult: false,
  },
  {
    id: 'grand-theft-auto',
    title: 'Grand Theft Auto',
    aliases: ['gta', 'gta 5', 'gta v', 'gta vi'],
    cover: null,
    provider: 'local',
    tags: ['ação', 'mundo aberto'],
    adult: true,
  },
  {
    id: 'red-dead-redemption',
    title: 'Red Dead Redemption',
    aliases: ['rdr', 'rdr2', 'rdr 2', 'red dead redemption 2', 'red dead'],
    cover: null,
    provider: 'local',
    tags: ['ação', 'mundo aberto'],
    adult: true,
  },
  {
    id: 'cyberpunk-2077',
    title: 'Cyberpunk 2077',
    aliases: ['cyberpunk', 'cp2077', 'cyberpunk 2077 phantom liberty'],
    cover: null,
    provider: 'local',
    tags: ['rpg', 'mundo aberto'],
    adult: true,
  },
  {
    id: 'fortnite',
    title: 'Fortnite',
    aliases: ['fn', 'fortnite battle royale'],
    cover: null,
    provider: 'local',
    tags: ['battle royale', 'construção'],
    adult: false,
  },
  {
    id: 'roblox',
    title: 'Roblox',
    aliases: ['roblox studio'],
    cover: null,
    provider: 'local',
    tags: ['plataforma', 'multiplayer'],
    adult: false,
  },
];