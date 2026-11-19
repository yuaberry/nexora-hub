import { ptBR } from './pt-BR/index.js';
import { en } from './en/index.js';

/**
 * Dicionários do site — planos, com paridade verificada pelo tipo.
 *
 * O PT-BR é a **fonte de verdade da forma**: as chaves nascem ali e o EN é
 * obrigado a tê-las todas (`satisfies Record<…, string>`). Uma chave em falta
 * é erro de compilação, não uma surpresa em produção.
 */

/** Idiomas suportados. */
export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Chave de tradução = chaves do PT-BR. */
export type TranslationKey = keyof typeof ptBR;

/** Forma que os dois dicionários cumprem. */
export type Dictionary = Record<TranslationKey, string>;

/** Dicionários efectivos, já verificados pelo tipo. */
export const DICTIONARIES: Readonly<Record<Locale, Dictionary>> = {
  'pt-BR': ptBR,
  en: en satisfies Dictionary,
};

/** Idioma por omissão (fonte de verdade da forma). */
export const DEFAULT_LOCALE: Locale = 'pt-BR';

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

/** Cria um tradutor preso a um idioma. */
export function createTranslator(locale: Locale) {
  return (key: TranslationKey, values?: Readonly<Record<string, string | number>>): string =>
    translate(key, locale, values);
}

export type Translator = ReturnType<typeof createTranslator>;

/** Todas as chaves conhecidas (usado pelos testes de paridade). */
export function translationKeys(): readonly TranslationKey[] {
  return Object.keys(DICTIONARIES[DEFAULT_LOCALE]) as TranslationKey[];
}