import {
  THEME_MODES,
  type Locale,
  type ScaleMode,
  type ThemeMode,
} from './tokens.js';

/**
 * Preferências de interface — locais ao dispositivo.
 *
 * Tema, escala, idioma, movimento e contraste vivem no `localStorage` **do
 * dispositivo**: respondem ao ecrã e a quem o usa, e não são sincronizados
 * com a conta. Não são segredos — ao contrário do token de autenticação, que
 * vive no `sessionStorage` e nunca é escrito por este módulo.
 *
 * O acesso é protegido: `localStorage` pode não existir (jsdom, pré-visualização
 * do SSR) ou estar bloqueado (navegador em modo privado). Uma preferência
 * perdida devolve o valor por omissão — nunca uma excepção.
 */

export const STORAGE_KEYS = {
  theme: 'nexora.theme',
  locale: 'nexora.locale',
  scale: 'nexora.scale',
  reduceMotion: 'nexora.motion.reduced',
  highContrast: 'nexora.contrast.high',
} as const;

/** Conjunto completo de preferências de interface. */
export interface InterfacePreferences {
  readonly theme: ThemeMode;
  readonly locale: Locale;
  readonly scale: ScaleMode;
  readonly reduceMotion: boolean;
  readonly highContrast: boolean;
}

/** Valores por omissão (tema segue o sistema). */
export const DEFAULT_PREFERENCES: InterfacePreferences = {
  theme: 'auto',
  locale: 'pt-BR',
  scale: 'default',
  reduceMotion: false,
  highContrast: false,
};

/** Lê uma entrada do armazenamento local sem nunca levantar excepção. */
export function readStored(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Escreve uma entrada no armazenamento local sem nunca levantar excepção. */
export function writeStored(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    // Armazenamento indisponível (modo privado, quota): a preferência fica só
    // nesta sessão. Nada de erro — uma preferência não justifica quebrar a app.
  }
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value !== null && (THEME_MODES as readonly string[]).includes(value);
}

function isScaleMode(value: string | null): value is ScaleMode {
  return value === 'auto' || value === 'compact' || value === 'default' || value === 'large' || value === 'xlarge';
}

function isLocale(value: string | null): value is Locale {
  return value === 'pt-BR' || value === 'en';
}

/**
 * Lê as preferências do dispositivo, com omissões declaradas.
 *
 * Um valor inválido no armazenamento (edição manual, versão antiga) cai no
 * valor por omissão — nunca é aceite às cegas.
 */
export function readPreferences(): InterfacePreferences {
  const theme = readStored(STORAGE_KEYS.theme);
  const locale = readStored(STORAGE_KEYS.locale);
  const scale = readStored(STORAGE_KEYS.scale);
  return {
    theme: isThemeMode(theme) ? theme : DEFAULT_PREFERENCES.theme,
    locale: isLocale(locale) ? locale : DEFAULT_PREFERENCES.locale,
    scale: isScaleMode(scale) ? scale : DEFAULT_PREFERENCES.scale,
    reduceMotion: readStored(STORAGE_KEYS.reduceMotion) === 'true',
    highContrast: readStored(STORAGE_KEYS.highContrast) === 'true',
  };
}

/** Grava as preferências no dispositivo. */
export function writePreferences(preferences: InterfacePreferences): void {
  writeStored(STORAGE_KEYS.theme, preferences.theme);
  writeStored(STORAGE_KEYS.locale, preferences.locale);
  writeStored(STORAGE_KEYS.scale, preferences.scale);
  writeStored(STORAGE_KEYS.reduceMotion, String(preferences.reduceMotion));
  writeStored(STORAGE_KEYS.highContrast, String(preferences.highContrast));
}

/** Grava apenas o tema. */
export function writeTheme(theme: ThemeMode): void {
  writeStored(STORAGE_KEYS.theme, theme);
}

/** Grava apenas o idioma. */
export function writeLocale(locale: Locale): void {
  writeStored(STORAGE_KEYS.locale, locale);
}

/** Grava a preferência de movimento. */
export function writeReduceMotion(reduce: boolean): void {
  writeStored(STORAGE_KEYS.reduceMotion, String(reduce));
}

/** Grava a preferência de contraste. */
export function writeHighContrast(high: boolean): void {
  writeStored(STORAGE_KEYS.highContrast, String(high));
}