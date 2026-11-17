/**
 * Normalização de texto de pesquisa.
 *
 * A barra de pesquisa de um launcher tem de perceber o que o utilizador
 * escreveu — não o que ele devia ter escrito. Três transformações, todas
 * puras e determinísticas:
 *
 * 1. **unaccent + minúsculas**: "Cyberpunk" e "cyberpunk" são a mesma coisa,
 *    e "Red Dead" não pode depender do teclado ter acento;
 * 2. **separação silábica**: títulos compostos ficam em palavras, para que
 *    "legends" encontre "League of Legends";
 * 3. **esqueleto de consoantes**: "mncft" encontra "Minecraft" — quem
 *    escreve rápido escreve consoantes.
 */

/** Texto normalizado: forma completa, sílabas e esqueleto de consoantes. */
export interface NormalizedText {
  /** Texto completo normalizado (minúsculas, sem acentos, espaços colapsados). */
  readonly full: string;
  /** Palavras do texto (separação silábica). */
  readonly syllables: readonly string[];
  /** Consoantes na ordem em que aparecem (dígitos preservados). */
  readonly consonants: string;
  /** `true` quando não sobra nada depois da normalização. */
  readonly empty: boolean;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const SEPARATORS = /[\s._\-/\\:;,+]+/g;
const VOWELS = /[aeiouáéíóúâêîôûàèìòùãõäëïöü]/g;
const NON_CONSONANTS = /[^a-z0-9]/g;

/**
 * Normaliza um texto para pesquisa.
 *
 * O `NFD` separa o acento da letra; retirar as marcas combinantes devolve a
 * mesma letra sem acento — em qualquer idioma latino, sem tabela de
 * substituição escrita à mão.
 */
export function normalizeText(input: string): NormalizedText {
  const full = input
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(SEPARATORS, ' ')
    .trim();

  const syllables = full === '' ? [] : full.split(' ');
  const consonants = full.replace(VOWELS, '').replace(NON_CONSONANTS, '');

  return {
    full,
    syllables,
    consonants,
    empty: full === '',
  };
}

/**
 * `true` quando `needle` é uma subsequência de `haystack`.
 *
 * É a correspondência aproximada: "mncft" é subsequência de "mncrft"
 * (Minecraft) — falta uma letra, mas a ordem mantém-se, e é isso que distingue
 * uma pesquisa de um acaso.
 */
export function isSubsequence(needle: string, haystack: string): boolean {
  if (needle === '') {
    return true;
  }
  let index = 0;
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1;
      if (index === needle.length) {
        return true;
      }
    }
  }
  return false;
}

/** Número de caracteres de `needle` cobertos por `haystack` (para pontuar). */
export function subsequenceCoverage(needle: string, haystack: string): number {
  if (needle === '') {
    return 0;
  }
  if (!isSubsequence(needle, haystack)) {
    return 0;
  }
  return needle.length;
}