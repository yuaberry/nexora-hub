import { defineConfig } from 'vitest/config';

/**
 * Configuração de teste da raiz — os projectos do workspace.
 *
 * O Vitest 4 removeu o ficheiro `vitest.workspace.ts`: a lista de projectos
 * passou a viver em `test.projects`, na configuração da raiz. Cada package
 * mantém o seu próprio ficheiro de configuração, de modo que
 * `pnpm --filter @nexora/core test` também funciona.
 */
export default defineConfig({
  test: {
    projects: [
      'packages/core',
      'packages/protocol',
      'packages/download',
      'packages/runner',
      'packages/cloud',
      'packages/plugins',
      'packages/ui',
      'apps/api',
      'apps/web',
      'apps/desktop',
      'apps/site',
    ],
  },
});