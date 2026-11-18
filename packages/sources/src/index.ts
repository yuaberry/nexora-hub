/**
 * `@nexora/sources` — sistema de fontes de downloads.
 *
 * O launcher transfere o que um **manifesto** declara. A NEXORA não hospeda
 * nem redistribui conteúdo: o manifesto é instalado pelo operador (ou pelo
 * utilizador), declara a sua base legal, e o motor transfere com verificação.
 *
 * O pacote não sabe nada de sites, scrapers ou APIs de terceiros — é
 * declarativo de propósito, para que a decisão legal de cada fonte fique com
 * quem a instala (attestation), e não escondida em código.
 */

export * from './manifest.js';
export {
  SourceRegistry,
  createSourceRegistry,
  type InstalledSource,
  type UnifiedGame,
} from './registry.js';

/**
 * Manifesto de demonstração — usado pelos testes e pelo ambiente local.
 *
 * Aponta para ficheiros de teste (nenhum jogo real): existe para provar o
 * ciclo completo — instalar, unificar, pesquisar, transferir, verificar —
 * sem depender de conteúdo de terceiros.
 */
export function demoManifest(): unknown {
  return {
    schemaVersion: 1,
    id: 'nexora/demo',
    name: 'NEXORA — demonstração',
    description: 'Manifesto de demonstração com ficheiros de teste locais. Nenhum jogo real.',
    legal: {
      basis: 'Conteúdo de demonstração criado para os testes do NEXORA HUB.',
      attestedBy: 'Yua Devs',
      attestedAt: new Date('2026-11-18T00:00:00.000Z').toISOString(),
    },
    games: [
      {
        id: 'jogo-teste',
        title: 'Jogo De Teste',
        aliases: ['teste', 'demo game'],
        version: '1.0.0',
        files: [
          {
            url: 'http://127.0.0.1:0/teste.bin',
            path: 'teste.bin',
            sha256: '0'.repeat(64),
            transport: 'http',
          },
        ],
        executables: ['teste.bin'],
        launcherRequired: false,
        sizeBytes: 1024,
      },
    ],
  };
}