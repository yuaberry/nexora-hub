import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveStaticPath } from '../src/main/protocol.js';

/**
 * Serviço de ficheiros do esquema interno.
 *
 * O que estes testes travam: a **travessia de caminho**. Um renderer
 * comprometido (ou um URL forjado) não pode pedir `../../../etc/passwd` —
 * o esquema recusa em vez de servir.
 */
describe('resolveStaticPath', () => {
  const root = mkdtempSync(join(tmpdir(), 'nexora-static-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html>');

  it('resolve um caminho dentro da raiz', () => {
    expect(resolveStaticPath(root, '/index.html')).toBe(resolve(join(root, 'index.html')));
  });

  it('recusa travessia para cima da raiz', () => {
    expect(resolveStaticPath(root, '/../../etc/passwd')).toBeNull();
    expect(resolveStaticPath(root, '/../fora.html')).toBeNull();
  });

  it('mantém caminhos absolutos dentro da raiz', () => {
    // Um `/etc/passwd` pedido pelo esquema é resolvido **dentro** da raiz do
    // renderer (join, não resolve do sistema): o ficheiro do sistema nunca é
    // servido, e um caminho inexistente devolve o fallback SPA.
    expect(resolveStaticPath(root, '/etc/passwd')).toBe(resolve(join(root, 'etc/passwd')));
  });

  it('normaliza pontos simples', () => {
    expect(resolveStaticPath(root, '/./index.html')).toBe(resolve(join(root, 'index.html')));
  });
});