/**
 * Moonlight — o cliente de *streaming*, em regras puras.
 *
 * O Moonlight é um cliente de Remote Play: liga-se a um anfitrião (Sunshine,
 * GeForce Experience) e corre os jogos que lá estão. O NEXORA HUB não faz
 * *streaming* — encaminha para o binário do sistema, que é quem sabe.
 *
 * O que vive aqui é o que se pode testar sem o binário:
 *
 * - os **comandos** (emparelhar, listar, jogar) — construídos sem inventar
 *   bandeiras;
 * - a **leitura** da lista de jogos do anfitrião (o formato do `moonlight
 *   list` é o documento: linhas `N. Nome`);
 * - a **validação** do endereço do anfitrião (um IP ou um nome de máquina).
 */

/** Os binários conhecidos do Moonlight (a ordem é a preferência). */
export const MOONLIGHT_BINARIES: readonly string[] = ['moonlight-qt', 'moonlight'];

/** Um jogo do anfitrião (como o `moonlight list` o apresenta). */
export interface MoonlightApp {
  /** O número que o Moonlight lhe deu (1, 2, 3…). */
  readonly index: number;
  readonly title: string;
}

/** Os argumentos para emparelhar com um anfitrião. */
export function pairArgs(host: string): readonly string[] {
  return ['pair', host.trim()];
}

/** Os argumentos para listar os jogos de um anfitrião. */
export function listArgs(host: string): readonly string[] {
  return ['list', host.trim()];
}

/**
 * Os argumentos para jogar um título do anfitrião.
 *
 * O Moonlight recebe o **número** do jogo (`stream <host> <index>`) — é o que
 * a lista dele mostra, e é o que liga o clique ao jogo certo.
 */
export function streamArgs(host: string, appIndex: number): readonly string[] {
  return ['stream', host.trim(), String(appIndex)];
}

/**
 * Lê a lista de jogos da saída do `moonlight list`.
 *
 * O formato documentado são linhas `N. Nome`. O que não bate com esse
 * formato é ignorado — uma linha de progresso ou de aviso não é um jogo, e
 * inventar entradas a partir de lixo seria pior que devolver menos.
 */
export function parseMoonlightApps(output: string): readonly MoonlightApp[] {
  const apps: MoonlightApp[] = [];
  for (const line of output.split('\n')) {
    const match = line.match(/^\s*(\d{1,2})\.\s+(.+?)\s*$/);
    if (match === null) {
      continue;
    }
    const index = Number(match[1]);
    const title = match[2];
    if (!Number.isInteger(index) || index < 1 || title === undefined || title === '') {
      continue;
    }
    apps.push({ index, title });
  }
  return apps;
}

/**
 * Um endereço de anfitrião é válido?
 *
 * Um IPv4, um nome de máquina (com pontos, como `pc.sala.local`) ou um
 * `[IPv6]` simples. Nada de espaços, nada de esquemas: o Moonlight recebe o
 * endereço tal e qual.
 */
export function isHostAddress(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const host = value.trim();
  if (host === '' || host.length > 253 || /\s/.test(host)) {
    return false;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host.split('.').every((part) => Number(part) <= 255);
  }
  return /^[a-zA-Z0-9.\-]+$/.test(host);
}