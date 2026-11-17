/**
 * Ponto de entrada da API do NEXORA HUB.
 *
 * Um processo só: a API REST e o *gateway* de tempo real partilham o mesmo
 * servidor HTTP.
 */
import { startServer } from './server.js';

startServer().catch((error: unknown) => {
  console.error('[nexora-hub] falha ao arrancar a API', error);
  process.exit(1);
});

export { startServer } from './server.js';
export { buildApp } from './app.js';
export { createMemoryRepositories } from './repositories/index.js';