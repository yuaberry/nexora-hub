/**
 * Alvos da limpeza — catálogo declarativo.
 *
 * Um otimizador honesto só apaga o que o **sistema regenera**: cache de
 * miniaturas, cache de shaders, lixo. Cada alvo declara o que acontece
 * quando é limpo — e os que têm custo (recompilar shaders, sair de sites)
 * trazem a cautela escrita, para o utilizador escolher com informação.
 *
 * O que exige privilégios ou pode quebrar o sistema (governor da CPU,
 * swappiness, desactivar serviços) **não entra aqui**: fica declarado como
 * recusado, com o motivo.
 */

/** Um alvo de limpeza. */
export interface CleanTarget {
  readonly id: string;
  /** Chave de tradução do nome (`optimizer.target.<id>`). */
  readonly labelKey: string;
  /** Chave de tradução do que acontece ao limpar. */
  readonly hintKey: string;
  /** `true` quando limpar tem um custo real (recompilação, re-login). */
  readonly caution: boolean;
}

/** O catálogo — a fonte da verdade dos alvos. */
export const CLEAN_TARGETS: readonly CleanTarget[] = [
  {
    id: 'thumbnails',
    labelKey: 'optimizer.target.thumbnails',
    hintKey: 'optimizer.hint.thumbnails',
    caution: false,
  },
  {
    id: 'trash',
    labelKey: 'optimizer.target.trash',
    hintKey: 'optimizer.hint.trash',
    caution: true,
  },
  {
    id: 'fontconfig',
    labelKey: 'optimizer.target.fontconfig',
    hintKey: 'optimizer.hint.fontconfig',
    caution: false,
  },
  {
    id: 'mesa-shader-cache',
    labelKey: 'optimizer.target.mesaShaderCache',
    hintKey: 'optimizer.hint.mesaShaderCache',
    caution: true,
  },
  {
    id: 'steam-shader-cache',
    labelKey: 'optimizer.target.steamShaderCache',
    hintKey: 'optimizer.hint.steamShaderCache',
    caution: true,
  },
];

/** Um alvo pelo identificador (`undefined` quando não existe). */
export function targetById(id: string): CleanTarget | undefined {
  return CLEAN_TARGETS.find((target) => target.id === id);
}

/**
 * Os alvos pedidos, na ordem do catálogo.
 *
 * Um identificador desconhecido é **ignorado**, não adivinhado: pedir para
 * limpar algo que não existe no catálogo não pode apagar nada.
 */
export function selectTargets(ids: readonly string[]): readonly CleanTarget[] {
  const wanted = new Set(ids);
  return CLEAN_TARGETS.filter((target) => wanted.has(target.id));
}

/** Um ajuste de arranque que a ferramenta pode aplicar sem privilégios. */
export interface LaunchTweak {
  readonly id: string;
  readonly labelKey: string;
  readonly hintKey: string;
  /** O que a ferramenta precisa de encontrar para o poder aplicar. */
  readonly requires: 'gamemode';
}

/** Ajustes aplicáveis (todos medidos, nenhum fingido). */
export const LAUNCH_TWEAKS: readonly LaunchTweak[] = [
  {
    id: 'gamemode',
    labelKey: 'optimizer.tweak.gamemode',
    hintKey: 'optimizer.hint.gamemode',
    requires: 'gamemode',
  },
];

/** Um ajuste declarado mas **recusado**, com o motivo. */
export interface DeclinedTweak {
  readonly id: string;
  readonly labelKey: string;
  /** Chave de tradução do motivo da recusa. */
  readonly reasonKey: string;
}

/**
 * O que um otimizador de YouTube faria e este não faz.
 *
 * Governor da CPU, swappiness e desactivar serviços exigem privilégios e
 * podem deixar o sistema instável — a ferramenta declara-os como recusados,
 * com o motivo, em vez de os fingir.
 */
export const DECLINED_TWEAKS: readonly DeclinedTweak[] = [
  {
    id: 'cpu-governor',
    labelKey: 'optimizer.declined.cpuGovernor',
    reasonKey: 'optimizer.reason.needsRoot',
  },
  {
    id: 'swappiness',
    labelKey: 'optimizer.declined.swappiness',
    reasonKey: 'optimizer.reason.needsRoot',
  },
  {
    id: 'services',
    labelKey: 'optimizer.declined.services',
    reasonKey: 'optimizer.reason.canBreak',
  },
  {
    id: 'ram-cleaner',
    labelKey: 'optimizer.declined.ramCleaner',
    reasonKey: 'optimizer.reason.snakeOil',
  },
];