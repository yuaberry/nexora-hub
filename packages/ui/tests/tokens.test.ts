import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Teste dos tokens de papel.
 *
 * A regra é: **nenhum componente tem cor própria**. Este teste lê o CSS
 * partilhado e verifica que os blocos de componente só referenciam tokens
 * (`var(--paper-*)`) — uma cor escrita num componente seria um rectângulo
 * colado à página no outro tema.
 */

const css = readFileSync(
  fileURLToPath(new URL('../src/theme/theme.css', import.meta.url)),
  'utf8',
);

/** CSS sem comentários (o parser só precisa de selectores e corpos). */
const cssWithoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Blocos `selector { ... }` com o selector e o corpo. */
function blocks(source: string): Array<{ selector: string; body: string }> {
  const result: Array<{ selector: string; body: string }> = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = pattern.exec(source);
  while (match !== null) {
    const selector = (match[1] ?? '').trim().split('\n').pop() ?? '';
    const body = match[2] ?? '';
    result.push({ selector, body });
    match = pattern.exec(source);
  }
  return result;
}

describe('tokens de tema', () => {
  it('declara os dois temas com os mesmos papéis', () => {
    expect(css).toContain("[data-theme='dark']");
    expect(css).toContain("[data-theme='light']");
  });

  it('o fundo mais fundo do escuro é o mais claro do claro', () => {
    const dark = blocks(cssWithoutComments).find((block) => block.selector === "[data-theme='dark']");
    const light = blocks(cssWithoutComments).find((block) => block.selector === "[data-theme='light']");
    expect(dark?.body).toContain('--paper-surface-deepest: #07070b');
    expect(light?.body).toContain('--paper-surface-deepest: #ffffff');
  });

  it('nenhum bloco de componente escreve cor própria', () => {
    const hexPattern = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
    const offenders = blocks(cssWithoutComments)
      .filter((block) => block.selector.startsWith('.nx-') || block.selector.startsWith('body'))
      .filter((block) => hexPattern.test(block.body));
    expect(offenders.map((block) => block.selector)).toEqual([]);
  });

  it('todo o componente bebe dos tokens de papel', () => {
    const button = blocks(cssWithoutComments).find((block) => block.selector === '.nx-button');
    expect(button?.body).toContain('var(--paper-surface-raised)');
    expect(button?.body).toContain('var(--paper-ink-strong)');
    const card = blocks(cssWithoutComments).find((block) => block.selector === '.nx-card');
    expect(card?.body).toContain('var(--paper-surface)');
  });

  it('a escala da interface é uma variável única na raiz', () => {
    expect(css).toContain('font-size: calc(16px * var(--paper-scale, 1))');
  });

  it('"reduzir movimento" desliga as transições', () => {
    expect(css).toContain("[data-motion='reduced']");
    expect(css).toContain('transition-duration: 0ms');
  });

  it('o alto contraste reforça tinta e linhas', () => {
    expect(css).toContain("[data-contrast='high']");
    expect(css).toContain('--paper-line-width: 2px');
  });

  it('a barra de armazenamento usa os três tons do tema', () => {
    expect(css).toContain('.nx-storage-bar__segment--accent');
    expect(css).toContain('.nx-storage-bar__segment--neutral');
    expect(css).toContain('.nx-storage-bar__segment--warning');
  });
});