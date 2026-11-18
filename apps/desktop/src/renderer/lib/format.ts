/**
 * Formatação do renderer.
 *
 * O tempo jogado é formatado com `Intl` no idioma activo — nunca uma unidade
 * escrita no código. Menos de uma hora mostra minutos; a partir daí, horas
 * com uma casa decimal (90 min → "1,5 h" em português, "1.5 h" em inglês).
 */

import type { Locale } from '@nexora/ui';
import type { TranslationKey } from '@nexora/ui';
import { translate } from '@nexora/ui';

/** Formata o tempo jogado (em segundos) no idioma activo. */
export function formatPlayTime(totalSeconds: number, locale: Locale, t: (key: TranslationKey, values?: Readonly<Record<string, string | number>>) => string): string {
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return t('common.time.minutes', { minutes: formatNumber(minutes, locale) });
  }
  const hours = totalSeconds / 3600;
  return t('common.time.hours', {
    hours: formatNumber(hours, locale, { maximumFractionDigits: 1 }),
  });
}

/** Número formatado no idioma (separador de decimal incluído). */
export function formatNumber(value: number, locale: Locale, options?: Readonly<Intl.NumberFormatOptions>): string {
  return new Intl.NumberFormat(locale, options ?? {}).format(value);
}

/** Bytes formatados no idioma (GB decimal, como a barra de armazenamento). */
export function formatBytes(bytes: number, locale: Locale, t: (key: TranslationKey, values?: Readonly<Record<string, string | number>>) => string): string {
  const gb = bytes / 1_000_000_000;
  return t('common.units.gb', { value: formatNumber(gb, locale, { maximumFractionDigits: 1 }) });
}

/** Data formatada no idioma (usada na última sessão). */
export function formatDate(iso: string | null, locale: Locale, neverLabel: string): string {
  if (iso === null) {
    return neverLabel;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return neverLabel;
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/** Tradução directa (reexporto para os testes do renderer). */
export { translate };