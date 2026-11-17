/**
 * `@nexora/download` — interface do motor de downloads.
 *
 * **Só a interface nesta fase.** Não existe motor, não existe transferência e
 * não existe cliente de torrent: a NEXORA não hospeda nem redistribui
 * conteúdo de jogos (ver `docs/LEGAL.md`), e nada aqui promete contornar
 * protecções como o Denuvo.
 *
 * O que existe é o **contrato** — o que a interface promete e o que uma
 * implementação futura terá de cumprir — e um motor de referência que se
 * recusa a arrancar, para que nenhum código chame um download que não
 * existe achando que vai funcionar.
 */

/** Estado declarado do motor. */
export interface DownloadAvailability {
  readonly status: 'planned';
  /** Chave de tradução do motivo (`planned.downloads`). */
  readonly reasonKey: 'downloads';
  /** Texto do motivo (pt-BR, a fonte de verdade da forma). */
  readonly reason: string;
}

/** Um pedido de download (contrato — nenhum motor o aceita ainda). */
export interface DownloadRequest {
  readonly gameId: string;
  /** Caminho ou URI de destino (pasta do utilizador). */
  readonly destinationPath: string;
}

/** Progresso de uma tarefa (contrato). */
export interface DownloadProgress {
  readonly taskId: string;
  /** 0–100; `null` enquanto o total é desconhecido. */
  readonly percent: number | null;
}

/** Resultado de iniciar uma tarefa: sempre recusado nesta fase. */
export type DownloadStartResult =
  | { readonly ok: true; readonly progress: DownloadProgress }
  | { readonly ok: false; readonly reasonKey: string; readonly reason: string };

/**
 * Interface do motor.
 *
 * Uma implementação futura cumpre este contrato — e entra com os seus testes
 * e com a autorização legal correspondente. Até lá, `createDownloadEngine`
 * devolve o motor de referência, que recusa.
 */
export interface DownloadEngine {
  readonly availability: DownloadAvailability;
  readonly start: (request: DownloadRequest) => Promise<DownloadStartResult>;
  readonly cancel: (taskId: string) => Promise<boolean>;
}

/** Disponibilidade do motor de downloads nesta fase. */
export const DOWNLOAD_AVAILABILITY: DownloadAvailability = {
  status: 'planned',
  reasonKey: 'downloads',
  reason: 'Motor de downloads: só a interface existe nesta fase.',
};

/**
 * Motor de referência — recusa sempre.
 *
 * Recusar **aqui**, e não na interface, é deliberado: um botão que chama um
 * motor inexistente tem de falhar de forma segura e declarada, nunca iniciar
 * uma transferência que ninguém implementou.
 */
export function createDownloadEngine(): DownloadEngine {
  const refuse = (): Promise<DownloadStartResult> =>
    Promise.resolve({
      ok: false,
      reasonKey: DOWNLOAD_AVAILABILITY.reasonKey,
      reason: DOWNLOAD_AVAILABILITY.reason,
    });

  return {
    availability: DOWNLOAD_AVAILABILITY,
    start: refuse,
    cancel: () => Promise.resolve(false),
  };
}