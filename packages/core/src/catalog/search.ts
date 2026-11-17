import type { Game, MatchKind, OwnershipContext, SearchHit } from '../types.js';
import { normalizeText, isSubsequence, subsequenceCoverage } from './normalize.js';

/**
 * Pesquisa de jogos com ordenação por relevância.
 *
 * A ordem é um compromisso declarado, do mais forte para o mais fraco:
 *
 * 1. **alias exacto** — quem escreveu "csgo" quis Counter-Strike;
 * 2. **título exacto** — quem escreveu o título completo;
 * 3. **prefixo** — um "l" encontra League of Legends;
 * 4. **sílaba** — "craft" encontra Minecraft;
 * 5. **consoantes** — "mncft" encontra Minecraft;
 * 6. **aproximada** (subsequência) — o resto, desde que a ordem se mantenha;
 * 7. **posse/recência** — só empata critérios iguais; nunca promove um jogo
 *    acima do que foi pesquisado.
 *
 * Resultado vazio é um resultado legítimo: a biblioteca não tem o jogo e a
 * interface diz "nenhum resultado", sem inventar entradas.
 */

/** Pontuações base por tipo de correspondência. */
const SCORES: Record<MatchKind, number> = {
  'alias-exact': 1000,
  'title-exact': 950,
  prefix: 800,
  syllable: 650,
  'consonant-prefix': 600,
  fuzzy: 400,
};

/** Bónus por posse e recência (último critério de desempate). */
const OWNED_BONUS = 20;
const RECENT_7_DAYS_BONUS = 30;
const RECENT_30_DAYS_BONUS = 15;
const SECONDS_PER_DAY = 86_400;

export interface SearchOptions {
  /** Contexto de posse/recência do utilizador (opcional). */
  readonly ownership?: OwnershipContext;
  /** Incluir entradas marcadas como adultas (por omissão, sim). */
  readonly includeAdult?: boolean;
  /** Número máximo de resultados. */
  readonly limit?: number;
}

/** Correspondência de um candidato (título ou alias) contra a pesquisa. */
export interface CandidateMatch {
  readonly kind: MatchKind;
  readonly score: number;
}

/**
 * Pontua um candidato contra a pesquisa.
 *
 * É uma função pura — o mesmo texto dá sempre a mesma pontuação — e é
 * exportada para poder ser testada sem catálogo. A normalização (acentos,
 * minúsculas) acontece aqui dentro, para que nenhum candidato seja comparado
 * com a forma que o utilizador "devia" ter escrito.
 */
export function scoreCandidate(
  queryText: string,
  candidateText: string,
  isTitle = false,
): CandidateMatch | undefined {
  const query = normalizeText(queryText);
  const candidate = normalizeText(candidateText);
  if (query.empty || candidate.empty) {
    return undefined;
  }

  if (query.full === candidate.full) {
    return {
      kind: isTitle ? 'title-exact' : 'alias-exact',
      score: isTitle ? SCORES['title-exact'] : SCORES['alias-exact'],
    };
  }

  if (candidate.full.startsWith(query.full)) {
    return { kind: 'prefix', score: SCORES.prefix + 40 * query.full.length };
  }

  if (candidate.syllables.some((syllable) => syllable.startsWith(query.full))) {
    return { kind: 'syllable', score: SCORES.syllable + 30 * query.full.length };
  }

  if (query.consonants !== '' && candidate.consonants.startsWith(query.consonants)) {
    return {
      kind: 'consonant-prefix',
      score: SCORES['consonant-prefix'] + 30 * query.consonants.length,
    };
  }

  if (isSubsequence(query.full, candidate.full)) {
    return {
      kind: 'fuzzy',
      score: SCORES.fuzzy + 20 * subsequenceCoverage(query.full, candidate.full),
    };
  }

  return undefined;
}

/** Bónus de posse/recência para um jogo (0 quando não há contexto). */
export function ownershipBonus(gameId: string, ownership: OwnershipContext | undefined): number {
  if (ownership === undefined) {
    return 0;
  }
  let bonus = ownership.ownedIds.has(gameId) ? OWNED_BONUS : 0;
  const recency = ownership.recencyById?.get(gameId);
  if (recency !== undefined) {
    const days = recency / SECONDS_PER_DAY;
    bonus += days <= 7 ? RECENT_7_DAYS_BONUS : days <= 30 ? RECENT_30_DAYS_BONUS : 0;
  }
  return bonus;
}

/**
 * Pesquisa jogos num catálogo.
 *
 * O melhor candidato de cada jogo é o que conta: uma entrada não aparece
 * duas vezes por causa de um alias forte e de um título fraco.
 */
export function searchGames(
  query: string,
  catalog: readonly Game[],
  options: SearchOptions = {},
): readonly SearchHit[] {
  const normalized = normalizeText(query);
  if (normalized.empty) {
    return [];
  }

  const includeAdult = options.includeAdult ?? true;
  const hits: SearchHit[] = [];

  for (const game of catalog) {
    if (!includeAdult && game.adult) {
      continue;
    }
    let best: CandidateMatch | undefined;
    const titleMatch = scoreCandidate(normalized.full, game.title, true);
    if (titleMatch !== undefined) {
      best = titleMatch;
    }
    for (const alias of game.aliases) {
      const match = scoreCandidate(normalized.full, alias);
      if (match !== undefined && (best === undefined || match.score > best.score)) {
        best = match;
      }
    }
    if (best === undefined) {
      continue;
    }
    const bonus = ownershipBonus(game.id, options.ownership);
    hits.push({ game, score: best.score + bonus, match: best.kind, ownedBonus: bonus });
  }

  hits.sort(
    (left, right) =>
      right.score - left.score ||
      left.game.title.localeCompare(right.game.title),
  );

  const limit = options.limit ?? hits.length;
  return hits.slice(0, limit);
}