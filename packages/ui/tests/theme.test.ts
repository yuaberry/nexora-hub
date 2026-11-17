import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  STORAGE_KEYS,
  readPreferences,
  writeHighContrast,
  writePreferences,
  writeTheme,
} from '../src/theme/preferences.js';
import {
  appliedTheme,
  autoScaleFactor,
  clampScale,
  scaleFactor,
  THEME_MODES,
  toggleTheme,
} from '../src/theme/tokens.js';

/** Armazenamento local mínimo para os testes (sem jsdom). */
class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

describe('tokens de tema', () => {
  it('base-950 é o fundo mais fundo no escuro e o mais claro no claro', () => {
    // A asserção é sobre o **papel**: no claro, o mais fundo é branco.
    expect(appliedTheme('light', true)).toBe('light');
    expect(appliedTheme('dark', false)).toBe('dark');
    expect(appliedTheme('auto', true)).toBe('dark');
    expect(appliedTheme('auto', false)).toBe('light');
  });

  it('o alternador percorre claro/escuro', () => {
    expect(toggleTheme('dark')).toBe('light');
    expect(toggleTheme('light')).toBe('dark');
    expect([...THEME_MODES]).toEqual(['light', 'dark', 'auto']);
  });

  it('limita a escala aos limites declarados', () => {
    expect(clampScale(0.1)).toBe(0.8);
    expect(clampScale(5)).toBe(1.6);
    expect(clampScale(1)).toBe(1);
    expect(clampScale(Number.NaN)).toBe(1);
  });

  it('o modo automático responde à largura do ecrã', () => {
    expect(autoScaleFactor(320)).toBe(0.9);
    expect(autoScaleFactor(500)).toBe(1);
    expect(autoScaleFactor(1000)).toBe(1.05);
    expect(autoScaleFactor(1440)).toBe(1.1);
    expect(autoScaleFactor(2560)).toBe(1.15);
  });

  it('o multiplicador efectivo é sempre o limitado', () => {
    expect(scaleFactor('xlarge', 320)).toBe(1.25);
    expect(scaleFactor('auto', 500)).toBe(1);
  });
});

describe('preferências de interface', () => {
  it('tem omissões declaradas', () => {
    const prefs = readPreferences();
    expect(prefs).toEqual(DEFAULT_PREFERENCES);
    expect(prefs.theme).toBe('auto');
    expect(prefs.locale).toBe('pt-BR');
  });

  it('grava e lê o tema', () => {
    writeTheme('dark');
    expect(readPreferences().theme).toBe('dark');
  });

  it('grava acessibilidade', () => {
    writeHighContrast(true);
    expect(readPreferences().highContrast).toBe(true);
  });

  it('grava o conjunto completo', () => {
    writePreferences({
      theme: 'light',
      locale: 'en',
      scale: 'large',
      reduceMotion: true,
      highContrast: true,
    });
    expect(readPreferences()).toEqual({
      theme: 'light',
      locale: 'en',
      scale: 'large',
      reduceMotion: true,
      highContrast: true,
    });
  });

  it('um valor inválido no armazenamento cai na omissão', () => {
    globalThis.localStorage.setItem(STORAGE_KEYS.theme, 'roxo');
    globalThis.localStorage.setItem(STORAGE_KEYS.locale, 'fr');
    globalThis.localStorage.setItem(STORAGE_KEYS.scale, 'gigante');
    const prefs = readPreferences();
    expect(prefs.theme).toBe('auto');
    expect(prefs.locale).toBe('pt-BR');
    expect(prefs.scale).toBe('default');
  });
});