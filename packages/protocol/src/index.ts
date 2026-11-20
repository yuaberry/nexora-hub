/**
 * `@nexora/protocol` — contrato HTTP/WS partilhado.
 *
 * Um único sítio onde a API, a web e o desktop concordam sobre a forma dos
 * dados. Não tem dependências: é TypeScript puro, para que qualquer lado o
 * consuma sem arrastar o Zod ou o Fastify.
 */

export * from './errors.js';
export * from './pagination.js';
export * from './auth.js';
export * from './catalog.js';
export * from './sessions.js';
export * from './planned.js';
export * from './realtime.js';
export * from './store.js';