import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  LOCALES,
  createTranslator,
  type Locale,
  type Translator,
} from './dictionaries/index.js';

/**
 * Contexto de i18n do site.
 *
 * O idioma é preferência do **visitante** (`localStorage`), com omissão
 * pt-BR — o mesmo princípio do tema: responde a quem está a ver, não a uma
 * conta. Aceder ao armazenamento está protegido: um valor inválido cai na
 * omissão, e um armazenamento indisponível não levanta excepção.
 */

interface SiteI18nValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translator;
}

const SiteI18nContext = createContext<SiteI18nValue | null>(null);

/** Provider do site. */
export function SiteI18nProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const stored = globalThis.localStorage?.getItem('nexora.site.locale');
      if (stored !== null && (LOCALES as readonly string[]).includes(stored)) {
        return stored as Locale;
      }
    } catch {
      // armazenamento indisponível: omissão declarada
    }
    return DEFAULT_LOCALE;
  });

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      globalThis.localStorage?.setItem('nexora.site.locale', next);
    } catch {
      // a preferência fica só nesta sessão
    }
  }, []);

  const value = useMemo<SiteI18nValue>(() => ({ locale, setLocale, t: createTranslator(locale) }), [locale, setLocale]);

  return <SiteI18nContext.Provider value={value}>{children}</SiteI18nContext.Provider>;
}

/** Acesso ao i18n do site. */
export function useSiteI18n(): SiteI18nValue {
  const value = useContext(SiteI18nContext);
  if (value === null) {
    throw new Error('useSiteI18n tem de ser usado dentro de SiteI18nProvider.');
  }
  return value;
}

/** Reexporta o tipo de chave e os idiomas (usados pelas páginas). */
export type { TranslationKey } from './dictionaries/index.js';
export { LOCALES, type Locale } from './dictionaries/index.js';