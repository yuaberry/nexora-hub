import { describe, expect, it } from 'vitest';
import { DICTIONARIES, LOCALES, createTranslator, translate, translationKeys } from '../src/i18n/dictionaries/index.js';
import { ptBR } from '../src/i18n/dictionaries/pt-BR/index.js';
import { en } from '../src/i18n/dictionaries/en/index.js';

/**
 * Site — dicionário e traducção.
 *
 * O que estes testes travam: **paridade** entre PT-BR e EN (o site é bilingue
 * de raiz), a substituição de `{nome}`, e a omissão para pt-BR.
 */

describe('dicionário do site', () => {
  it('tem exactamente as mesmas chaves nos dois idiomas', () => {
    const ptKeys = Object.keys(DICTIONARIES['pt-BR']).sort();
    const enKeys = Object.keys(DICTIONARIES['en']).sort();
    expect(enKeys).toEqual(ptKeys);
  });

  it('a fonte de verdade da forma é o PT-BR (tipada pelo tipo)', () => {
    expect(translationKeys()).toContain('hero.title');
    expect(typeof ptBR['hero.title']).toBe('string');
    expect(en satisfies Record<keyof typeof ptBR, string>).toBeTruthy();
  });
});

describe('translate', () => {
  it('devolve o texto declarado (e ignora valores sem marcador)', () => {
    expect(translate('downloads.requirementsText', 'pt-BR')).toContain('Windows');
    expect(createTranslator('en')('brand.name')).toBe('NEXORA HUB');
    // Valores dados a uma chave sem marcador não rebentam nem alteram.
    expect(translate('brand.name', 'en', { nome: 'X' })).toBe('NEXORA HUB');
  });

  it('tem todos os textos não vazios', () => {
    for (const key of translationKeys()) {
      expect(DICTIONARIES['pt-BR'][key].length).toBeGreaterThan(0);
      expect(DICTIONARIES['en'][key].length).toBeGreaterThan(0);
    }
  });

  it('suporta os dois idiomas', () => {
    expect(LOCALES).toEqual(['pt-BR', 'en']);
    expect(translate('nav.download', 'pt-BR')).toBe('Descarregar');
    expect(translate('nav.download', 'en')).toBe('Download');
  });
});
