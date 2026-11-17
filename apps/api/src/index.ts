/**
 * Ponto de entrada da API do NEXORA HUB.
 *
 * Um processo só: a API REST e o *gateway* de tempo real partilham o mesmo
 * servidor HTTP.
 */
export { startServer } from './server.js';
export { buildApp } from './app.js';
export { createMemoryRepositories } from './repositories/index.js';
export * from './plugins/errorHandler.js';