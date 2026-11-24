import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../src/App.js';
import { storeTokens } from '../src/api/client.js';

/**
 * Testes de estrutura da web.
 *
 * Renderização estática (sem DOM): verificam o que a interface **diz** nos
 * dois idiomas — e que os módulos planeados aparecem com o selo, nunca com um
 * botão que finge funcionar.
 */

/** Armazenamento de sessão mínimo (sem jsdom). */
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
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

function render(path: string, locale: 'pt-BR' | 'en' = 'pt-BR', authenticated = false): string {
  if (authenticated) {
    storeTokens('token-de-teste', 'renovacao-de-teste');
  }
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <App initialLocale={locale} />
    </MemoryRouter>,
  );
}

describe('estrutura da web', () => {

  it('a biblioteca sincronizada explica de onde vem a cápsula', () => {
    // A rota exige sessão; com sessão (e sem rede no teste) a secção mostra
    // o estado vazio honesto — e diz de onde vem a arte.
    const html = render('/biblioteca', 'pt-BR', true);
    expect(html).toContain('A tua biblioteca');
    expect(html).toContain('arte pública da Steam');
    expect(html).toContain('A carregar'); // sem rede no teste, o estado honesto de carregamento
  });

    it('a rota de login mostra o formulário em PT-BR', () => {
    const html = render('/login', 'pt-BR');
    expect(html).toContain('Entrar no NEXORA HUB');
    expect(html).toContain('E-mail');
    expect(html).toContain('Senha');
  });

  it('a rota de login mostra o formulário em EN', () => {
    const html = render('/login', 'en');
    expect(html).toContain('Sign in to NEXORA HUB');
    expect(html).toContain('Email');
    expect(html).toContain('Password');
  });

  it('a biblioteca declara os módulos planeados, sem botões fingidos', () => {
    const html = render('/biblioteca', 'pt-BR', true);
    expect(html).toContain('Biblioteca');
    expect(html).toContain('Planeado');
    // Nenhum botão de download, loja ou amigos na fase 1.
    expect(html).not.toContain('Descarregar');
    expect(html).not.toContain('Comprar');
  });

  it('o painel administrativo é um esqueleto com selo', () => {
    const html = render('/admin', 'pt-BR', true);
    expect(html).toContain('Administração');
    expect(html).toContain('Planeado');
  });

  it('um caminho inexistente dá o 404 da aplicação', () => {
    const html = render('/caminho-que-nao-existe', 'pt-BR');
    expect(html).toContain('Página não encontrada');
  });

  it('sem sessão, a biblioteca não mostra conteúdo (a guarda manda para o login)', () => {
    const html = render('/biblioteca', 'pt-BR');
    expect(html).toContain('hub-shell');
    expect(html).not.toContain('Tempo jogado');
  });

  it('o cabeçalho traz o alternador de tema e o selector de idioma', () => {
    const html = render('/login', 'pt-BR');
    expect(html).toContain('nx-theme-switch');
    expect(html).toContain('hub-locale');
    expect(html).toContain('hub-scale');
  });
});