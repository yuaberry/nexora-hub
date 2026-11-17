/**
 * Tokens de tema — papéis, não luminâncias.
 *
 * Os nomes dos tokens são **papéis** (`surface-deepest`, `ink-strong`,
 * `accent`): no tema escuro `surface-deepest` é o fundo mais fundo; no claro,
 * o mais claro. Um componente que usa os papéis desenha correctamente nos
 * dois temas sem variantes `dark:` — e nenhum componente pode ter cor própria
 * (há teste que verifica as classes do selector).
 */

/** Modos de tema. `auto` segue o sistema. */
export const THEME_MODES = ['light', 'dark', 'auto'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

/** Tema efectivamente aplicado ao documento. */
export type AppliedTheme = 'light' | 'dark';

/** Idiomas suportados. */
export const LOCALES = ['pt-BR', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Modos de escala da interface. */
export const SCALE_MODES = ['auto', 'compact', 'default', 'large', 'xlarge'] as const;
export type ScaleMode = (typeof SCALE_MODES)[number];

/** Multiplicadores por modo de escala. */
export const SCALE_FACTORS: Readonly<Record<Exclude<ScaleMode, 'auto'>, number>> = {
  compact: 0.9,
  default: 1,
  large: 1.1,
  xlarge: 1.25,
};

/** Limites do multiplicador de escala. */
export const SCALE_MIN = 0.8;
export const SCALE_MAX = 1.6;

/** Multiplicador devolvido pelo modo `auto`, por largura de ecrã. */
export function autoScaleFactor(width: number): number {
  if (width < 360) {
    return 0.9;
  }
  if (width < 768) {
    return 1;
  }
  if (width < 1280) {
    return 1.05;
  }
  if (width < 1920) {
    return 1.1;
  }
  return 1.15;
}

/** Limita um multiplicador aos limites declarados. */
export function clampScale(factor: number): number {
  if (!Number.isFinite(factor)) {
    return 1;
  }
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, factor));
}

/** Multiplicador efectivo de um modo de escala. */
export function scaleFactor(mode: ScaleMode, width: number): number {
  const raw = mode === 'auto' ? autoScaleFactor(width) : (SCALE_FACTORS[mode] ?? 1);
  return clampScale(raw);
}

/**
 * Tema efectivo a partir da preferência.
 *
 * `auto` consulta o sistema (`prefers-color-scheme`); uma preferência
 * explícita sobrepõe-se sempre a ele.
 */
export function appliedTheme(mode: ThemeMode, prefersDark: boolean): AppliedTheme {
  if (mode === 'auto') {
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

/** Alterna entre claro e escuro a partir do tema aplicado. */
export function toggleTheme(applied: AppliedTheme): ThemeMode {
  return applied === 'dark' ? 'light' : 'dark';
}