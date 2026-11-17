import { describe, expect, it } from 'vitest';
import {
  DICTIONARIES,
  LOCALE_OPTIONS,
  createTranslator,
  translate,
  translationKeys,
} from '../src/i18n/dictionaries/index.js';

describe('dicionário pt-BR/en', () => {
  it('tem exactamente as mesmas chaves nos dois idiomas', () => {
    const ptKeys = Object.keys(DICTIONARIES['pt-BR']).sort();
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    expect(enKeys).toEqual(ptKeys);
  });

  it('não tem tradução vazia', () => {
    for (const key of translationKeys()) {
      expect(DICTIONARIES['pt-BR'][key].trim().length).toBeGreaterThan(0);
      expect(DICTIONARIES.en[key].trim().length).toBeGreaterThan(0);
    }
  });

  it('o nome da marca é igual nos dois idiomas', () => {
    expect(DICTIONARIES.en['common.app.name']).toBe('NEXORA HUB');
    expect(DICTIONARIES['pt-BR']['common.app.name']).toBe('NEXORA HUB');
  });

  it('traduz no idioma pedido', () => {
    expect(translate('nav.library', 'pt-BR')).toBe('Biblioteca');
    expect(translate('nav.library', 'en')).toBe('Library');
  });

  it('substitui valores nomeados', () => {
    expect(translate('login.mfa.code', 'pt-BR')).toBeTruthy();
    const translator = createTranslator('en');
    expect(translator('common.action.play')).toBe('Play');
  });

  it('oferece os dois idiomas com rótulo na própria língua', () => {
    expect(LOCALE_OPTIONS.map((option) => option.id)).toEqual(['pt-BR', 'en']);
    expect(LOCALE_OPTIONS[1]?.label).toBe('English');
  });

  it('as chaves dos módulos planeados existem para todos os módulos', () => {
    expect(DICTIONARIES['pt-BR']['planned.store']).toContain('NEXORA');
    expect(DICTIONARIES.en['planned.store']).toContain('NEXORA');
    expect(DICTIONARIES['pt-BR']['planned.downloads']).toContain('só a interface');
  });
});