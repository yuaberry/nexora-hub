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
export * from './stats/aggregate.js';
export * from './stats/timeline.js';
export * from './family/types.js';
export * from './family/limits.js';
export * from './family/state.js';
export * from './family/shared-games.js';
export * from './importers/vdf.js';
export * from './importers/steam.js';
export * from './social/friends.js';
export * from './social/presence.js';
export * from './telemetry/procfs.js';

