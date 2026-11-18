import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_API_BASE_URL,
  hasRendererBuild,
  hasWebBuild,
  normalizeApiBaseUrl,
  packageRoot,
  resolveConfig,
} from '../src/main/config.js';

/**
 * Configuração da aplicação de desktop.
 *
 * O que estes testes travam: a base da API é normalizada (um endereço mal
 * formado cai na omissão em vez de quebrar o reencaminhamento) e os caminhos
 * dos recursos apontam para o **build** do renderer — o defeito clássico de
 * apontar para a pasta errada e servir uma janela branca.
 */
describe('normalizeApiBaseUrl', () => {
  it('mantém um endereço válido sem barra final', () => {
    expect(normalizeApiBaseUrl('http://127.0.0.1:3100/')).toBe('http://127.0.0.1:3100');
  });

  it('descarta caminho e query', () => {
    expect(normalizeApiBaseUrl('http://api.nexora.local/v1?x=1')).toBe('http://api.nexora.local');
  });

  it('cai na omissão quando o endereço é inválido', () => {
    expect(normalizeApiBaseUrl('não-é-url')).toBe(DEFAULT_API_BASE_URL);
  });
});

describe('resolveConfig', () => {
  it('aponta o renderer para o build compilado (desenvolvimento)', () => {
    const config = resolveConfig({}, false, '/app/apps/desktop', '/resources', '/user/data');
    expect(config.rendererRoot).toBe('/app/apps/desktop/dist/renderer');
    expect(config.startUrl).toBe('nexora://app/');
  });

  it('usa os recursos do pacote quando empacotado', () => {
    const config = resolveConfig({}, true, '/app/apps/desktop', '/resources', '/user/data');
    expect(config.rendererRoot).toBe('/resources/renderer');
    expect(config.databasePath).toBe('/user/data/nexora-hub.sqlite');
  });

  it('respeita NEXORA_API_URL', () => {
    const config = resolveConfig({ NEXORA_API_URL: 'http://127.0.0.1:9999' }, false, '/a', '/b', '/c');
    expect(config.apiBaseUrl).toBe('http://127.0.0.1:9999');
  });
});

describe('diagnóstico de builds', () => {
  it('detecta a presença do index.html em cada raiz', () => {
    const rendererDir = mkdtempSync(join(tmpdir(), 'nexora-renderer-'));
    const webDir = mkdtempSync(join(tmpdir(), 'nexora-web-'));
    writeFileSync(join(rendererDir, 'index.html'), '<!doctype html>');
    expect(hasRendererBuild(rendererDir)).toBe(true);
    // A raiz da web é um directório diferente: sem index.html, o diagnóstico
    // diz que o build não está lá (em vez de fingir que está).
    expect(hasWebBuild(webDir)).toBe(false);
    writeFileSync(join(webDir, 'index.html'), '<!doctype html>');
    expect(hasWebBuild(webDir)).toBe(true);
  });

  it('raiz do pacote termina em apps/desktop', () => {
    expect(packageRoot().endsWith('/desktop')).toBe(true);
  });
});