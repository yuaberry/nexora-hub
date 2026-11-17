import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { readPreferences, writePreferences, type InterfacePreferences } from '../theme/preferences.js';
import {
  appliedTheme,
  toggleTheme,
  type AppliedTheme,
  type Locale,
  type ScaleMode,
  type ThemeMode,
} from '../theme/tokens.js';
import { createTranslator, type Translator } from './dictionaries/index.js';

/**
 * Contexto de interface — tema, idioma, escala e acessibilidade.
 *
 * As preferências pertencem ao **dispositivo** (`localStorage`), não à conta:
 * o tema e a escala respondem ao ecrã de quem o usa, como o idioma. A
 * aplicação acontece em `useLayoutEffect` — antes do primeiro desenho — e sem
 * *script inline*, porque a CSP do executável de desktop proíbe
 * `unsafe-inline`.
 *
 * O token de autenticação **não** passa por aqui: vive no `sessionStorage`.
 */

export interface InterfaceContextValue {
  readonly locale: Locale;
  readonly setLocale: (locale: Locale) => void;
  readonly t: Translator;
  readonly theme: ThemeMode;
  readonly appliedTheme: AppliedTheme;
  readonly setTheme: (theme: ThemeMode) => void;
  readonly toggleTheme: () => void;
  readonly scale: ScaleMode;
  readonly setScale: (scale: ScaleMode) => void;
  readonly reduceMotion: boolean;
  readonly setReduceMotion: (reduce: boolean) => void;
  readonly highContrast: boolean;
  readonly setHighContrast: (high: boolean) => void;
  readonly preferences: InterfacePreferences;
}

const InterfaceContext = createContext<InterfaceContextValue | null>(null);

/** Lê a preferência do sistema para o modo `auto`. */
function systemPrefersDark(): boolean {
  if (typeof globalThis.matchMedia !== 'function') {
    return false;
  }
  return globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Aplica as preferências ao documento (tema, idioma, contraste, movimento). */
export function applyPreferencesToDocument(preferences: InterfacePreferences, element?: HTMLElement): void {
  if (typeof document === 'undefined') {
    return;
  }
  const target = element ?? document.documentElement;
  const theme = appliedTheme(preferences.theme, systemPrefersDark());
  target.dataset['theme'] = theme;
  target.dataset['contrast'] = preferences.highContrast ? 'high' : 'normal';
  target.dataset['motion'] = preferences.reduceMotion ? 'reduced' : 'full';
  target.lang = preferences.locale;
}

export function InterfaceProvider({
  children,
  initialLocale,
}: {
  readonly children: ReactNode;
  /** Idioma inicial (usado pelos testes, para não depender de armazenamento). */
  readonly initialLocale?: Locale;
}): ReactNode {
  const [preferences, setPreferences] = useState<InterfacePreferences>(() => {
    const stored = readPreferences();
    return initialLocale === undefined ? stored : { ...stored, locale: initialLocale };
  });

  const theme = appliedTheme(preferences.theme, systemPrefersDark());

  const setLocale = useCallback((locale: Locale) => {
    setPreferences((current) => {
      const next = { ...current, locale };
      writePreferences(next);
      return next;
    });
  }, []);

  const setTheme = useCallback((mode: ThemeMode) => {
    setPreferences((current) => {
      const next = { ...current, theme: mode };
      writePreferences(next);
      return next;
    });
  }, []);

  const setScale = useCallback((scale: ScaleMode) => {
    setPreferences((current) => {
      const next = { ...current, scale };
      writePreferences(next);
      return next;
    });
  }, []);

  const setReduceMotion = useCallback((reduce: boolean) => {
    setPreferences((current) => {
      const next = { ...current, reduceMotion: reduce };
      writePreferences(next);
      return next;
    });
  }, []);

  const setHighContrast = useCallback((high: boolean) => {
    setPreferences((current) => {
      const next = { ...current, highContrast: high };
      writePreferences(next);
      return next;
    });
  }, []);

  const value = useMemo<InterfaceContextValue>(() => {
    const t = createTranslator(preferences.locale);
    return {
      locale: preferences.locale,
      setLocale,
      t,
      theme: preferences.theme,
      appliedTheme: theme,
      setTheme,
      toggleTheme: () => {
        setTheme(toggleTheme(theme));
      },
      scale: preferences.scale,
      setScale,
      reduceMotion: preferences.reduceMotion,
      setReduceMotion,
      highContrast: preferences.highContrast,
      setHighContrast,
      preferences,
    };
  }, [preferences, setLocale, setTheme, setScale, setReduceMotion, setHighContrast, theme]);

  return <InterfaceContext.Provider value={value}>{children}</InterfaceContext.Provider>;
}

/** Acesso ao contexto de interface. */
export function useInterface(): InterfaceContextValue {
  const value = useContext(InterfaceContext);
  if (value === null) {
    throw new Error('useInterface tem de ser usado dentro de InterfaceProvider.');
  }
  return value;
}

/** Atalho para o tradutor do idioma activo. */
export function useT(): Translator {
  return useInterface().t;
}

/** Aplica a escala ao elemento raiz (chamado em `useLayoutEffect` pelas apps). */
export function applyScale(rootFontScale: number, element?: HTMLElement): void {
  if (typeof document === 'undefined') {
    return;
  }
  const target = element ?? document.documentElement;
  target.style.setProperty('--paper-scale', String(rootFontScale));
}