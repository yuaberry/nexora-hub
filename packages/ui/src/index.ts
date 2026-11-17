/**
 * `@nexora/ui` — tokens de tema, i18n e componentes partilhados.
 *
 * Consumido pela web e pelo desktop: os dois usam os **mesmos** tokens, o
 * **mesmo** dicionário e os **mesmos** componentes. Um componente não tem cor
 * própria e um texto não vive escrito no código.
 */

export * from './theme/tokens.js';
export * from './theme/preferences.js';
export * from './i18n/dictionaries/index.js';
export * from './i18n/InterfaceProvider.js';
export * from './components/controls.js';
export * from './components/display.js';
export * from './components/game.js';
export * from './components/layout.js';