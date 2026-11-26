/**
 * O plugin que a NEXORA **envia** com o launcher.
 *
 * A "Steam Integration" é o plugin que a NEXORA mantém: liga o launcher ao
 * cliente oficial que o utilizador já tem instalado — lê os manifestos
 * locais, hidrata as capas com a cápsula pública da loja e lista as DLCs
 * declaradas. Nada disso é descarregado pela NEXORA: são leituras do disco
 * do utilizador e pedidos públicos à página da loja (ver `docs/LEGAL.md`).
 *
 * Viver no package tem uma razão simples: o manifesto é **dados**, e o teste
 * que garante que ele valida é o mesmo teste da validação — um manifesto
 * que a própria plataforma recusasse seria um bug de arranque.
 */

import type { PluginManifest } from './types.js';

/** O manifesto do plugin de integração com a Steam (instalado por omissão). */
export const STEAM_INTEGRATION_MANIFEST: PluginManifest = {
  id: 'steam-integration',
  name: 'Steam Integration',
  version: '1.0.0',
  author: 'NEXORA',
  descriptionKey: 'plugin.steam.description',
  capabilities: ['steam:sync', 'steam:cover', 'steam:dlc'],
};