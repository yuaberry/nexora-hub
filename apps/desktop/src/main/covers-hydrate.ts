/**
 * Hidratação das capas — a mesma arte para todos os utilizadores.
 *
 * A pasta local da Steam (`librarycache`) só existe em quem tem a Steam
 * instalada: quem instalou o jogo por outro caminho, ou numa máquina sem a
 * loja, ficava sem capa ou com uma capa diferente. A **cápsula pública**
 * (`library_600x900.jpg`) é a mesma para toda a gente — vertical, quadrada na
 * informação, e é a arte que a parede de jogos mostra.
 *
 * Este módulo busca essa cápsula pelo appid (o processo principal fala com a
 * Internet; o renderer não pode) e guarda-a no cache do disco, ao lado da base
 * local. A entrada passa a apontar para o ficheiro local — a biblioteca fica
 * completa offline, e todas as máquinas mostram a mesma capa.
 *
 * Regra que se mantém: uma capa **escolhida pelo utilizador** nunca é
 * substituída (`cover_chosen`) — a escolha dele vale mais que a nossa.
 */

import { steamPortraitUrl } from '@nexora/core';
import { cacheRemoteCover, type BytesFetch } from './cover-cache.js';
import type { LocalLibrary } from './db.js';

/** Quantos pedidos em paralelo (a loja agradece a moderação). */
const CONCURRENCY = 4;

/** Relatório do que a hidratação fez. */
export interface HydrateReport {
  readonly updated: number;
  readonly failed: number;
  readonly skipped: number;
}

/** Nome base de um caminho (evita importar o `path` inteiro por uma chamada). */
function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/**
 * A cápsula de uma entrada, já guardada no cache.
 *
 * `skipped` quando não há o que fazer: sem appid não há cápsula pública, e uma
 * capa escolhida pelo utilizador nem é tocada. `failed` quando a loja não dá
 * a imagem — a entrada fica com a capa que tem.
 */
async function portraitFor(
  entry: { readonly id: number; readonly steamAppId: string | null; readonly cover: string | null; readonly coverChosen: boolean },
  cacheDir: string,
  fetch: BytesFetch | undefined,
): Promise<{ readonly outcome: 'skipped' } | { readonly outcome: 'failed' } | { readonly outcome: 'updated'; readonly path: string }> {
  if (entry.steamAppId === null || entry.coverChosen) {
    return { outcome: 'skipped' };
  }
  const portrait = steamPortraitUrl(entry.steamAppId);
  // Já é a cápsula em cache: nada a fazer.
  if (entry.cover !== null && entry.cover.endsWith(basename(portrait))) {
    return { outcome: 'skipped' };
  }
  const local = await cacheRemoteCover(portrait, cacheDir, fetch);
  return local === null ? { outcome: 'failed' } : { outcome: 'updated', path: local };
}

/**
 * Hidrata as capas de toda a biblioteca.
 *
 * Corre em lotes de `CONCURRENCY` pedidos — uma biblioteca grande não deve
 * transformar-se em dezenas de pedidos ao mesmo tempo. O relatório diz o que
 * mudou: nada de "capas actualizadas" sem provas.
 */
export async function hydrateCovers(
  library: LocalLibrary,
  cacheDir: string,
  fetch?: BytesFetch,
): Promise<HydrateReport> {
  const all = library.list();
  let updated = 0;
  let failed = 0;
  let skipped = 0;

  for (let index = 0; index < all.length; index += CONCURRENCY) {
    const batch = all.slice(index, index + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (entry) => {
        const result = await portraitFor(entry, cacheDir, fetch);
        if (result.outcome === 'updated') {
          // `chosen: false`: a hidratação é automática, e uma escolha futura
          // do utilizador continua a poder substituí-la.
          library.setCover(entry.id, result.path, false);
        }
        return result.outcome;
      }),
    );
    for (const outcome of results) {
      if (outcome === 'updated') {
        updated += 1;
      } else if (outcome === 'failed') {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return { updated, failed, skipped };
}