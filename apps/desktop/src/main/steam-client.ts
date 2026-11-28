/**
 * O cliente oficial da Steam — onde ele está, e como o abrir.
 *
 * O launcher não instala lojas e não finge que uma existe: confia no cliente
 * que o utilizador já tem. Este módulo descobre esse cliente e **abre-o
 * limpo**.
 *
 * Duas regras que aqui são deliberadas:
 *
 * 1. a lista de caminhos é **oficial e curta** — ferramentas de terceiros que
 *    se façam passar pelo cliente (shims, emuladores, contornadores de
 *    licença) nunca entram: encaminhar um jogo para uma delas seria participar
 *    da fraude que existem para fazer (`docs/LEGAL.md`);
 * 2. o ambiente do cliente é **limpo** — as variáveis que injudam bibliotecas
 *    em processos alheios (`LD_PRELOAD`, `LD_AUDIT`, `LD_LIBRARY_PATH`) são
 *    removidas antes do arranque. Um cliente alterado por outra ferramenta
 *    arranca, mas não abre jogos: a prova real desta fase apanhou um cliente
 *    com `LD_AUDIT` a apontar para um dessas ferramentas, e o jogo nunca
 *    aparecia. O launcher não propaga isso.
 */

import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

/** Sítios oficiais do cliente da Steam em Linux. */
function steamCandidates(): readonly string[] {
  const home = homedir();
  return [
    join(home, '.local', 'share', 'Steam', 'steam.sh'),
    join(home, '.steam', 'steam', 'steam.sh'),
    '/usr/bin/steam',
    '/usr/local/bin/steam',
    '/usr/games/steam',
  ];
}

/** O caminho do cliente oficial, ou `null` quando não está instalado. */
export function findSteamClient(): string | null {
  for (const candidate of steamCandidates()) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** O URL oficial de arranque de um jogo (o protocolo do cliente). */
export function steamRunUrl(appId: string): string {
  return `steam://rungameid/${appId.trim()}`;
}

/** Variáveis que alteram o comportamento de bibliotecas noutros processos. */
const INJECTION_VARS: readonly string[] = ['LD_PRELOAD', 'LD_AUDIT', 'LD_LIBRARY_PATH'];

/**
 * O ambiente limpo para o cliente oficial.
 *
 * Tudo o que o launcher tem, menos o que serve para injudar código em
 * processos: as variáveis de injecção saem e o `PATH` ganha o sítio do
 * cliente (para que `steam.sh` encontre os seus binários).
 */
export function steamClientEnv(clientPath: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || INJECTION_VARS.includes(key)) {
      continue;
    }
    // As ferramentas de contorno marcam o ambiente com o seu nome: não são do
    // cliente oficial, e por isso não viajam com ele.
    if (key.startsWith('SLS') || key.startsWith('SLSM')) {
      continue;
    }
    env[key] = value;
  }
  // O `steam.sh` está na raiz da instalação: é ela que vai ao `PATH`.
  const raiz = dirname(clientPath);
  env['PATH'] = `${raiz}:${join(raiz, 'bin')}:${env['PATH'] ?? '/usr/bin:/bin'}`;
  return env;
}

/**
 * O `LD_AUDIT` do cliente que está a correr, quando há um cliente alterado.
 *
 * A leitura é de `/proc/<pid>/environ` (Linux, do próprio utilizador — o
 * processo é do mesmo dono). Se o cliente em execução carrega uma biblioteca
 * de auditoria de outra ferramenta, ele arranca mas **não abre jogos**: a
 * prova real desta fase apanhou um cliente com `LD_AUDIT` a apontar para um
 * contornador de licenças, e o pedido de arranque perdia-se sem deixar rasto.
 * Com isto, o launcher diz o que se passa em vez de mandar um pedido ao vazio.
 */
export function runningClientInjection(): string | null {
  let entries: readonly string[];
  try {
    entries = readdirSync('/proc');
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) {
      continue;
    }
    const environPath = `/proc/${entry}/environ`;
    let exe: string;
    try {
      exe = readlinkSync(`/proc/${entry}/exe`);
    } catch {
      continue;
    }
    // O binário do cliente: o `steam` do *runtime* do cliente oficial.
    if (!exe.endsWith('/steam')) {
      continue;
    }
    if (!exe.includes('/Steam/steamrt') && !exe.includes('/.steam/')) {
      continue;
    }
    try {
      const environ = readFileSync(environPath, 'utf8');
      for (const line of environ.split('\0')) {
        if (line.startsWith('LD_AUDIT=') && line.length > 'LD_AUDIT='.length) {
          return line.slice('LD_AUDIT='.length);
        }
      }
      return null;
    } catch {
      // processo que desapareceu a meio da leitura: continua a varredura
    }
  }
  return null;
}