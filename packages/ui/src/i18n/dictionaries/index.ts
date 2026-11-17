import { ptBR } from './pt-BR/index.js';
import { en } from './en/index.js';
import type { Locale } from '../../theme/tokens.js';

/**
 * i18n com dicionários planos e paridade verificada por compilação.
 *
 * - o PT-BR é a **fonte de verdade da forma**: as chaves nascem ali;
 * - `TranslationKey` é `keyof typeof ptBR`;
 * - `Dictionary` obriga o EN a ter **exactamente** as mesmas chaves: uma
 *   chave em falta é erro de compilação, não uma surpresa em produção.
 *
 * Não há chaves construídas por concatenação — o tipo não as conseguiria
 * validar.
 */

export type TranslationKey = keyof typeof ptBR;

/** Forma que os dois dicionários têm de cumprir. */
export type Dictionary = Record<TranslationKey, string>;

/** Dicionários efectivos, já verificados pelo tipo. */
export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = {
  'pt-BR': ptBR,
  en: en satisfies Dictionary,
};

/** Idioma por omissão (fonte de verdade da forma). */
export const DEFAULT_LOCALE: Locale = 'pt-BR';

/** Idiomas suportados, com o rótulo na própria língua. */
export const LOCALE_OPTIONS: ReadonlyArray<{ readonly id: Locale; readonly label: string }> = [
  { id: 'pt-BR', label: 'Português (Brasil)' },
  { id: 'en', label: 'English' },
];

/** Devolve a tradução de uma chave num idioma. */
export function translate(
  key: TranslationKey,
  locale: Locale,
  values?: Readonly<Record<string, string | number>>,
): string {
  const template = DICTIONARIES[locale][key];
  if (values === undefined) {
    return template;
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = values[name];
    return value === undefined ? match : String(value);
  });
}

/** Cria um tradutor preso a um idioma (evita repetir o idioma em cada chamada). */
export function createTranslator(locale: Locale) {
  return (key: TranslationKey, values?: Readonly<Record<string, string | number>>): string =>
    translate(key, locale, values);
}

export type Translator = ReturnType<typeof createTranslator>;

/** Todas as chaves conhecidas (usado pelos testes de paridade). */
export function translationKeys(): readonly TranslationKey[] {
  return Object.keys(DICTIONARIES[DEFAULT_LOCALE]) as TranslationKey[];
}