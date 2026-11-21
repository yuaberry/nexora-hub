/**
 * Plano de arranque — como um executável é invocado no sistema.
 *
 * O launcher corre o executável **do utilizador**. Num sistema Linux, um
 * executável Windows (`.exe`) precisa de uma camada de compatibilidade
 * (Wine/Proton) — e a decisão é explícita:
 *
 * - sem Wine no sistema, o arranque é **recusado com motivo**
 *   (`wine-unavailable`), nunca fingido;
 * - o prefixo Wine é **por jogo**, para que a configuração de um jogo não
 *   contamine outro;
 * - nada aqui instala Wine, não pede privilégios e não toca em drivers.
 */

import type { LaunchRequest, LaunchRefusal } from './types.js';

/** Camada de compatibilidade escolhida. */
export type CompatLayer = 'native' | 'wine';

/** Plano de arranque resolvido. */
export type LaunchPlan =
  | {
      readonly ok: true;
      /** Comando efectivo (o executável, ou o wrapper Wine). */
      readonly command: string;
      /** Argumentos finais (o wrapper fica à frente). */
      readonly args: readonly string[];
      readonly layer: CompatLayer;
      /** Variáveis de ambiente a injectar (prefixo Wine, etc.). */
      readonly env: Readonly<Record<string, string>>;
    }
  | { readonly ok: false } & LaunchRefusal;

/** Contexto do sistema para resolver o plano. */
export interface LaunchContext {
  /** Sistema operativo (`process.platform`). */
  readonly platform: string;
  /** Caminho do binário Wine/Proton encontrado, ou `null`. */
  readonly winePath: string | null;
  /** Directório base para os prefixos Wine. */
  readonly winePrefixRoot: string;
  /**
   * Caminho do `gamemoderun`, ou `null`.
   *
   * O GameMode (Feral) é o tweak de desempenho que se pode fazer **sem
   * privilégios e sem quebrar nada**: governor, prioridade de I/O e
   * escalonador, aplicados só enquanto o jogo corre. Sem ele, o plano não
   * muda — a ferramenta não finge uma optimização que não existe.
   */
  readonly gameModePath?: string | null;
}

/**
 * Caminho do prefixo Wine de um jogo.
 *
 * Função pura — e o único sítio onde o caminho é construído, para que o
 * plano e quem prepara o disco calculem a **mesma** pasta. A prova real
 * ensinou: o Wine faz `chdir` para o prefixo e morre com código 1 se a
 * pasta não existir, e por isso quem arranca cria-a antes (o spawn não
 * cria directorias).
 */
export function winePrefixPath(prefixRoot: string, gameId: string): string {
  return `${prefixRoot}/${slug(gameId)}`;
}

/**
 * Resolve o plano de arranque de um pedido.
 *
 * A decisão é uma função **pura** do contexto: a mesma entrada dá sempre o
 * mesmo plano, e os testes provam cada ramo sem depender do sistema.
 */
export function resolveLaunchPlan(request: LaunchRequest, context: LaunchContext): LaunchPlan {
  const isWindowsExecutable = request.executablePath.toLowerCase().endsWith('.exe');
  const needsWine = context.platform === 'linux' && isWindowsExecutable;

  // A camada de compatibilidade decide o comando e os argumentos; o GameMode
  // (quando existe) embrulha o resultado — as duas camadas compõem-se sem
  // substituir o ambiente do prefixo.
  let command: string;
  let args: readonly string[];
  let layer: CompatLayer;
  let env: Readonly<Record<string, string>>;

  if (!needsWine) {
    command = request.executablePath;
    args = request.args ?? [];
    layer = 'native';
    env = {};
  } else if (context.winePath === null) {
    return {
      ok: false,
      reasonKey: 'no-runner',
      reason: 'Wine não encontrado: instale o Wine (ou o Proton) para correr jogos Windows no Linux.',
    };
  } else {
    command = context.winePath;
    args = [request.executablePath, ...(request.args ?? [])];
    layer = 'wine';
    env = {
      WINEPREFIX: winePrefixPath(context.winePrefixRoot, request.gameId),
      WINEDLLOVERRIDES: 'winemenubuilder.exe=d',
    };
  }

  if (context.gameModePath !== undefined && context.gameModePath !== null) {
    return {
      ok: true,
      command: context.gameModePath,
      args: [command, ...args],
      // A camada continua a ser a do jogo: o GameMode é um embrulho, não a
      // forma de correr o jogo.
      layer,
      env,
    };
  }

  return { ok: true, command, args, layer, env };
}

/** Nome de pasta seguro para o prefixo Wine. */
function slug(gameId: string): string {
  return (
    gameId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64) || 'jogo'
  );
}