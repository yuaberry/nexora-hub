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
export * from './community/forums.js';
export * from './community/clans.js';
export * from './community/events.js';
export * from './community/reputation.js';
export * from './diagnostics/rules.js';
export * from './format/clock.js';
export * from './telemetry/procfs.js';
export * from './optimizer/targets.js';
export * from './optimizer/report.js';
export * from './chat/conversations.js';
export * from './achievements/achievements.js';
export * from './benchmark/spec.js';
export * from './benchmark/workloads.js';
export * from './mods/detect.js';
export * from './mods/install.js';
export * from './remote/moonlight.js';
export * from './remote/sunshine.js';
export * from './recommend/similar.js';
export * from './steam/images.js';
export * from './steam/catalog.js';

