/**
 * Bateria — o estado da energia, em regras puras.
 *
 * Um portátil a jogar depende da bateria, e um launcher que a ignora deixa
 * quem joga na cama sem aviso. As leituras do sistema são dois ficheiros
 * (`capacity` e `status`); o que vivem aqui são as regras — testadas sem
 * tocar no disco.
 *
 * - a **percentagem** é o que o sistema diz (0–100, nem mais nem menos);
 * - o **estado** é uma das palavras do kernel (`Charging`, `Discharging`,
 *   `Full`, `Not charging`, `Unknown`);
 * - o **nível** é a leitura traduzida em três bandas declaradas.
 */

/** Limiares do nível da bateria. */
export const BATTERY_LOW_PERCENT = 20;
export const BATTERY_CRITICAL_PERCENT = 10;

/** O estado da bateria. */
export interface BatteryState {
  /** Percentagem (0–100). */
  readonly percent: number;
  /** A palavra do kernel. */
  readonly status: string;
  /** Está a carregar? */
  readonly charging: boolean;
  /** O nível traduzido. */
  readonly level: 'ok' | 'low' | 'critical';
}

/**
 * Monta o estado a partir das leituras brutas.
 *
 * Uma leitura impossível (percentagem negativa, acima de 100, ou uma palavra
 * desconhecida) não é inventada: o estado fica `Unknown` e quem chama diz
 * "sem leitura".
 */
export function batteryState(capacity: unknown, status: unknown): BatteryState | null {
  const percent = typeof capacity === 'number' && Number.isFinite(capacity) ? Math.round(capacity) : null;
  if (percent === null || percent < 0 || percent > 100) {
    return null;
  }
  const word = typeof status === 'string' ? status.trim() : '';
  const charging = word.toLowerCase() === 'charging';
  const level = percent <= BATTERY_CRITICAL_PERCENT ? 'critical' : percent <= BATTERY_LOW_PERCENT ? 'low' : 'ok';
  return { percent, status: word === '' ? 'Unknown' : word, charging, level };
}

/** O texto do estado (para a interface, no idioma de quem chama). */
export function batteryLabelKey(state: BatteryState): 'battery.charging' | 'battery.discharging' | 'battery.full' | 'battery.unknown' {
  if (state.charging) {
    return 'battery.charging';
  }
  if (state.status.toLowerCase() === 'full') {
    return 'battery.full';
  }
  if (state.status.toLowerCase() === 'unknown') {
    return 'battery.unknown';
  }
  return 'battery.discharging';
}