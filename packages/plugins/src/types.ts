/**
 * `@nexora/plugins` — o contrato dos plugins do NEXORA HUB.
 *
 * Um plugin **não** é código de terceiros a correr dentro do launcher: é um
 * **manifesto declarativo** que liga capacidades já construídas a um jogo, a
 * uma loja ou a um serviço. O utilizador instala, activa e desactiva — e o
 * que o plugin pode fazer é sempre algo que a plataforma já sabe fazer.
 *
 * Esta escolha é deliberada e defensável: um sistema que corre código
 * arbitrario seria um buraco de segurança com aassinatura do utilizador. O
 * manifesto é audível, e a fronteira de confiança é a mesma do resto do
 * projecto.
 */

/**
 * Quando uma capacidade corre.
 *
 * Só `manual` existe hoje: cada capacidade é disparada pelo utilizador
 * (sincronizar, hidratar capas, listar DLCs). Um hook automático — no
 * arranque, no fim de sessão — só entra na lista quando o comportamento
 * existir de facto; anunciar a cadência antes seria o mesmo que fingir a
 * funcionalidade.
 */
export type PluginHook = 'manual';

/** Uma capacidade que um plugin pode declarar (a lista é fechada). */
export interface PluginCapability {
  /** O identificador estável (`steam:sync`, `steam:cover`, `steam:dlc`). */
  readonly id: string;
  /** A chave de tradução do nome (a interface mostra no idioma certo). */
  readonly nameKey: string;
  /** Quando a capacidade corre. */
  readonly hook: PluginHook;
}

/** Um manifesto de plugin (`manifest.json` na pasta do plugin). */
export interface PluginManifest {
  /** O identificador estável (`steam-integration`). */
  readonly id: string;
  readonly name: string;
  /** Versão semântica (`1.0.0`). */
  readonly version: string;
  readonly author: string;
  /** A chave de tradução da descrição. */
  readonly descriptionKey: string;
  /** As capacidades que o plugin declara. */
  readonly capabilities: readonly string[];
}

/** Um plugin instalado (o manifesto + o estado local). */
export interface InstalledPlugin {
  readonly manifest: PluginManifest;
  /** O plugin está activo? (instalado mas desactivado não faz nada) */
  readonly enabled: boolean;
  /** ISO-8601 UTC da instalação. */
  readonly installedAt: string;
}

/** O resultado de validar um manifesto. */
export type ManifestValidation =
  | { readonly ok: true; readonly manifest: PluginManifest }
  | { readonly ok: false; readonly reason: 'not-json' | 'missing-field' | 'bad-id' | 'bad-version' | 'unknown-capability' };

/**
 * As capacidades que a plataforma **aplica** — a lista fechada.
 *
 * Cada entrada corresponde a um comportamento real do launcher, com um ponto
 * de aplicação concreto: sincronizar a biblioteca com os manifestos da Steam,
 * hidratar as capas com a cápsula pública da loja e listar as DLCs
 * declaradas. Uma capacidade que ninguém lê seria um interruptor que não
 * faz nada — por isso a lista é esta, e só esta.
 */
export const KNOWN_CAPABILITIES: readonly PluginCapability[] = [
  { id: 'steam:sync', nameKey: 'plugin.capability.steamSync', hook: 'manual' },
  { id: 'steam:cover', nameKey: 'plugin.capability.steamCover', hook: 'manual' },
  { id: 'steam:dlc', nameKey: 'plugin.capability.steamDlc', hook: 'manual' },
];