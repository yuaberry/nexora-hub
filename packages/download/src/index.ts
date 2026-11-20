/**
 * `@nexora/download` — motor de downloads do NEXORA HUB.
 *
 * O motor é **neutro**: transfere ficheiros de URLs declaradas num manifesto
 * instalado pelo utilizador. A NEXORA não hospeda nem redistribui conteúdo
 * de jogos (`docs/LEGAL.md`), e nada aqui promete contornar protecções como
 * o Denuvo.
 *
 * O que existe agora:
 *
 * - **HTTP multi-conexão com retoma** (`http-downloader.ts`): partes
 *   parciais independentes, concatenação por ordem, verificação por
 *   checksum antes do rename;
 * - **fila** (`queue.ts`): prioridade, espaço verificado antes, progresso
 *   medido no disco, pausa/retoma;
 * - **torrent: só a interface** — continua `planned`. Um cliente de torrent
 *   é dependência nativa com decisão própria (biblioteca, licença, build);
 *   até existir, a fila recusa torrents com motivo honesto em vez de fingir.
 */

export * from './types.js';
export {
  DEFAULT_CONNECTIONS,
  MAX_CONNECTIONS,
  checkSpace,
  downloadHttp,
  planChunks,
  probe,
} from './http-downloader.js';
export { sha256OfFile, verifyFile } from './checksum.js';
export {
  extractArchive,
  planExtraction,
  type ExtractMethod,
  type ExtractPlan,
  type ExtractResult,
} from './extract.js';
export { verifyInstall, type FileVerification, type InstallVerification, type VerifiableFile } from './verify.js';
export { volumeSpace } from './volume.js';
export { DownloadQueue, MAX_CONCURRENT, createDownloadQueue } from './queue.js';

/**
 * Disponibilidade declarada por transporte.
 *
 * `http` está implementado e verificado por testes; `torrent` está planeado e
 * a interface diz-o — um limite novo entra com a sua regra de aplicação, não
 * só com o texto.
 */
export interface TransportAvailability {
  readonly http: 'available';
  readonly torrent: 'planned';
  readonly torrentReasonKey: 'downloads';
}

export const TRANSPORT_AVAILABILITY: TransportAvailability = {
  http: 'available',
  torrent: 'planned',
  torrentReasonKey: 'downloads',
};