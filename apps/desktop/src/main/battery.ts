/**
 * Bateria — o estado da energia, lido do sistema.
 *
 * No Linux o kernel publica o estado em `/sys/class/power_supply/`, nas
 * pastas `BAT…`, com os ficheiros `capacity` e `status`; noutros sistemas a
 * leitura não existe e o estado fica `null` — quem chama diz "sem leitura" em
 * vez de inventar uma percentagem. As regras (bandas, palavras) são do
 * domínio; aqui só se lê.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { batteryState, type BatteryState } from '@nexora/core';

/** A raiz das fontes de energia do kernel. */
const POWER_SUPPLY = '/sys/class/power_supply';

/** Lê um ficheiro do kernel (texto aparado, ou `null`). */
function readKernel(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * O estado da bateria (a primeira bateria que responde).
 *
 * Procura `BAT*` entre as fontes de energia (um portátil tem baterias e o
 * carregador; os adaptadores não são baterias). Uma percentagem que não é
 * número é tratada como leitura em falta.
 */
export function readBattery(): BatteryState | null {
  let sources: readonly string[];
  try {
    sources = readdirSync(POWER_SUPPLY);
  } catch {
    return null;
  }
  for (const name of sources) {
    if (!name.startsWith('BAT')) {
      continue;
    }
    const folder = join(POWER_SUPPLY, name);
    if (!existsSync(folder)) {
      continue;
    }
    const capacityText = readKernel(join(folder, 'capacity'));
    if (capacityText === null) {
      continue;
    }
    const state = batteryState(Number(capacityText), readKernel(join(folder, 'status')));
    if (state !== null) {
      return state;
    }
  }
  return null;
}
