/**
 * `@nexora/core` — domínio puro do NEXORA HUB.
 *
 * Não depende de nenhum outro package do workspace e não conhece a API, a
 * web nem o desktop: tudo aqui é função pura, testável sem infraestrutura.
 */

export * from './types.js';
export * from './catalog/normalize.js';
export * from './catalog/fixtures.js';
export * from './catalog/alias-index.js';
export * from './catalog/search.js';
export * from './storage/bar.js';
export * from './plans/plans.js';
export * from './store/types.js';
export * from './store/catalog.js';
export * from './store/filters.js';
