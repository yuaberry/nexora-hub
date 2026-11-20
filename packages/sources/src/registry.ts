/**
 * Registro de fontes instaladas e catálogo unificado.
 *
 * O registro é a **fonte própria com nome próprio**: vários manifestos
 * instalados pelo operador aparecem como um catálogo único, pesquisável pelo
 * mesmo motor da biblioteca (`searchGames`). A unificação não copia conteúdo
 * — apenas junta metadados e aponta para o manifesto de origem.
 *
 * Um jogo cujo transporte é `torrent` fica marcado como indisponível
 * (`transport: 'planned'`): o cliente de torrent não existe ainda, e a
 * interface não pode oferecer o que a fila não sabe transferir.
 */

import { searchGames, type Game, type SearchHit } from '@nexora/core';
import { validateManifest, type ManifestGame, type SourceManifest } from './manifest.js';

/** Estado de uma fonte instalada. */
export interface InstalledSource {
  readonly manifest: SourceManifest;
  /** Origem da instalação (ficheiro local, URL do operador). */
  readonly origin: string;
  /** ISO-8601 UTC da instalação. */
  readonly installedAt: string;
}

/** Uma entrada do catálogo unificado. */
export interface UnifiedGame {
  /** Identificador composto (`fonteId/jogoId`) — estável entre fontes. */
  readonly id: string;
  readonly sourceId: string;
  readonly title: string;
  readonly aliases: readonly string[];
  readonly version: string | undefined;
  /** `false` quando o jogo só existe por torrent (transporte planeado). */
  readonly available: boolean;
  /** `true` quando o jogo precisa do launcher oficial (handoff). */
  readonly launcherRequired: boolean;
  readonly sizeBytes: number | undefined;
  /** Caminhos candidatos a executável, do manifesto. */
  readonly executables: readonly string[];
  /** App id da Steam declarado pelo manifesto (para ProtonDB), ou `null`. */
  readonly steamAppId: string | null;
  /** Extracção automática declarada (método + ficheiro), ou `null`. */
  readonly extract: { readonly method: 'zip' | 'tar.gz'; readonly filePath: string } | null;
}

/** Cria o registro de fontes. */
export function createSourceRegistry(): SourceRegistry {
  return new SourceRegistry();
}

/** Registro de fontes com catálogo unificado. */
export class SourceRegistry {
  private readonly sources = new Map<string, InstalledSource>();

  /**
   * Instala um manifesto (o JSON cru, vindo do operador).
   *
   * Recusa sem attestation, com `id` repetido e com manifesto inválido — a
   * recusa devolve os motivos, para quem instala poder corrigir.
   */
  install(input: unknown, origin: string): { readonly ok: true; readonly source: InstalledSource } | { readonly ok: false; readonly issues: readonly string[] } {
    const validation = validateManifest(input);
    if (!validation.ok) {
      return { ok: false, issues: validation.issues };
    }
    if (this.sources.has(validation.manifest.id)) {
      return { ok: false, issues: [`fonte já instalada: ${validation.manifest.id}`] };
    }
    const source: InstalledSource = {
      manifest: validation.manifest,
      origin,
      installedAt: new Date().toISOString(),
    };
    this.sources.set(source.manifest.id, source);
    return { ok: true, source };
  }

  /** Remove uma fonte instalada. */
  remove(sourceId: string): boolean {
    return this.sources.delete(sourceId);
  }

  /** Lista as fontes instaladas (com o estado e a attestation). */
  list(): readonly InstalledSource[] {
    return [...this.sources.values()].sort((left, right) => left.manifest.name.localeCompare(right.manifest.name));
  }

  /** Uma fonte instalada, ou `null`. */
  get(sourceId: string): InstalledSource | null {
    return this.sources.get(sourceId) ?? null;
  }

  /** Jogo do catálogo unificado pelo identificador composto. */
  game(unifiedId: string): UnifiedGame | null {
    const [sourceId, gameId] = splitUnifiedId(unifiedId);
    if (sourceId === null || gameId === null) {
      return null;
    }
    const source = this.sources.get(sourceId);
    const game = source?.manifest.games.find((entry) => entry.id === gameId);
    return source !== undefined && game !== undefined ? toUnifiedGame(source.manifest.id, game) : null;
  }

  /** Catálogo unificado (todas as fontes). */
  catalog(): readonly UnifiedGame[] {
    const games: UnifiedGame[] = [];
    for (const source of this.sources.values()) {
      for (const game of source.manifest.games) {
        games.push(toUnifiedGame(source.manifest.id, game));
      }
    }
    return games;
  }

  /**
   * Pesquisa no catálogo unificado.
   *
   * Usa o motor da biblioteca: "l" encontra League of Legends, "mncft"
   * encontra Minecraft — entre os jogos que os manifestos instalados declaram.
   */
  search(query: string, limit = 20): readonly SearchHit[] {
    const catalog: readonly Game[] = this.catalog().map((entry) => ({
      id: entry.id,
      title: entry.title,
      aliases: entry.aliases,
      cover: null,
      provider: 'local',
      tags: [],
      adult: false,
    }));
    return searchGames(query, catalog, { limit });
  }
}

/** Converte uma entrada de manifesto em entrada unificada. */
function toUnifiedGame(sourceId: string, game: ManifestGame): UnifiedGame {
  const hasHttp = game.files.some((file) => file.transport === 'http');
  return {
    id: `${sourceId}/${game.id}`,
    sourceId,
    title: game.title,
    aliases: game.aliases,
    version: game.version,
    available: hasHttp,
    launcherRequired: game.launcherRequired,
    sizeBytes: game.sizeBytes,
    executables: game.executables,
    steamAppId: game.steamAppId ?? null,
    extract: game.extract === undefined ? null : { method: game.extract.method, filePath: game.extract.filePath },
  };
}

/**
 * Divide `operador/fonte/jogo` nas duas partes (`null` se não couber).
 *
 * A fonte tem **exactamente** uma barra (`operador/fonte`, validado pelo
 * schema) e o jogo não pode ter nenhuma: por isso a divisão é pela primeira
 * barra para a fonte e pelo resto para o jogo — sem ambiguidade.
 */
function splitUnifiedId(unifiedId: string): readonly [string | null, string | null] {
  const parts = unifiedId.split('/');
  if (parts.length !== 3) {
    return [null, null];
  }
  const [operator, source, gameId] = parts as [string, string, string];
  if (operator === '' || source === '' || gameId === '') {
    return [null, null];
  }
  return [`${operator}/${source}`, gameId];
}