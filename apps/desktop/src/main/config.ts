import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Configuração da aplicação de desktop.
 *
 * Espelha o Nexora Cloud: o cliente aponta para a API por omissão
 * (`http://127.0.0.1:3100`) e o endereço real é configurável por
 * `NEXORA_API_URL` — o único sítio onde o executável aceita um endereço
 * externo, e nunca guarda credenciais.
 */

/** Base da API por omissão (servidor local de desenvolvimento). */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3100';

/** Esquema interno da aplicação. */
export const APP_SCHEME = 'nexora';

/** Configuração efectiva da aplicação. */
export interface DesktopConfig {
  /** Base da API REST (sem barra final). */
  readonly apiBaseUrl: string;
  /** Directório com o build da web (recurso do pacote). */
  readonly webRoot: string;
  /** Directório do renderer compilado. */
  readonly rendererRoot: string;
  /** Caminho da base de dados local do launcher. */
  readonly databasePath: string;
  /** URL inicial da janela. */
  readonly startUrl: string;
}

/**
 * Resolve a configuração a partir do ambiente e da localização do pacote.
 *
 * `isPackaged` distingue a execução empacotada (os recursos estão em
 * `process.resourcesPath`) da execução em desenvolvimento.
 */
export function resolveConfig(
  env: NodeJS.ProcessEnv,
  isPackaged: boolean,
  appRoot: string,
  resourcesPath: string,
  userDataPath: string,
): DesktopConfig {
  const apiBaseUrl = normalizeApiBaseUrl(env.NEXORA_API_URL ?? DEFAULT_API_BASE_URL);
  const webRoot = isPackaged ? join(resourcesPath, 'web') : resolve(appRoot, '..', 'web', 'dist');
  const rendererRoot = isPackaged
    ? join(resourcesPath, 'renderer')
    : resolve(appRoot, 'dist', 'renderer');
  const databasePath = isPackaged
    ? join(userDataPath, 'nexora-hub.sqlite')
    // Em desenvolvimento a base de dados vive em `.dev-data/`, dentro do
    // pacote da aplicação: não depende do directório de onde se lançou.
    : resolve(appRoot, '.dev-data', 'nexora-hub.dev.sqlite');

  return {
    apiBaseUrl,
    webRoot,
    rendererRoot,
    databasePath,
    startUrl: `${APP_SCHEME}://app/`,
  };
}

/**
 * Normaliza a base da API: sem barra final e sem caminho.
 *
 * Um endereço mal formado faria o reencaminhamento bater num caminho que não
 * existe — e a interface mostraria um erro que não é do utilizador.
 */
export function normalizeApiBaseUrl(input: string): string {
  try {
    const url = new URL(input);
    return `${url.protocol}//${url.host}`;
  } catch {
    return DEFAULT_API_BASE_URL;
  }
}

/** Directório do pacote de desktop (em ESM não existe `__dirname`). */
export function packageRoot(): string {
  return resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
}

/** `true` quando o build da web está presente (diagnóstico de arranque). */
export function hasWebBuild(webRoot: string): boolean {
  return existsSync(join(webRoot, 'index.html'));
}

/** `true` quando o build do renderer está presente. */
export function hasRendererBuild(rendererRoot: string): boolean {
  return existsSync(join(rendererRoot, 'index.html'));
}