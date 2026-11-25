/**
 * Sunshine — o anfitrião desta máquina, encaminhado.
 *
 * O launcher não faz *streaming*: o **Sunshine** (binário do sistema) é quem
 * corre o anfitrião. Este módulo encontra-o, pergunta se está a correr, dá-o
 * a arrancar e diz o endereço que outros aparelhos devem usar.
 *
 * O "está a correr?" é uma pergunta à **porta** (a web do Sunshine responde
 * em 47990), não ao processo: um processo que arrancou e morreu não é um
 * anfitrião. O verificador é injectável — os testes não precisam do Sunshine.
 */

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { networkInterfaces } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  isLanAddress,
  SUNSHINE_BINARIES,
  SUNSHINE_WEB_PORT,
  sunshineWebUrl,
} from '@nexora/core';

const execFileAsync = promisify(execFile);

/** Um executor injectável (a forma do `execFile` prometido). */
export type Runner = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

/** O executor real (o binário do sistema, com tempo limite). */
async function realRun(command: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(command, args, { timeout: 20_000, encoding: 'buffer' });
  return { stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') };
}

/** Procura o binário do Sunshine no PATH. */
export async function findSunshine(run: Runner = realRun): Promise<string | null> {
  for (const binary of SUNSHINE_BINARIES) {
    try {
      await run(binary, ['--version']);
      return binary;
    } catch {
      // não está no PATH: nada a fazer
    }
  }
  return null;
}

/** Um verificador de porta injectável (para os testes). */
export type PortCheck = (port: number) => Promise<boolean>;

/** O verificador real: a porta responde? */
const realPortCheck: PortCheck = (port) =>
  new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1_500);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });

/** O endereço desta máquina na rede local (ou `null` quando não há). */
export function lanAddress(): string | null {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal && address.family === 'IPv4' && isLanAddress(address.address)) {
        return address.address;
      }
    }
  }
  return null;
}

/** O que a interface precisa de saber do anfitrião. */
export interface SunshineStatus {
  /** O binário encontrado (`null` quando não está instalado). */
  readonly binary: string | null;
  /** A porta web responde? (é assim que se sabe que está a correr) */
  readonly running: boolean;
  /** O endereço da interface web (`null` sem rede local). */
  readonly url: string | null;
}

/** O estado do anfitrião. */
export async function sunshineStatus(
  check: PortCheck = realPortCheck,
  run: Runner = realRun,
): Promise<SunshineStatus> {
  const binary = await findSunshine(run);
  const running = await check(SUNSHINE_WEB_PORT);
  const address = lanAddress();
  return { binary, running, url: address === null ? null : sunshineWebUrl(address) };
}

/**
 * Dá o anfitrião a arrancar.
 *
 * O Sunshine vive sozinho (um serviço com interface web): o arranque é
 * *desacoplado*. `true` significa "o pedido de arranque foi feito" — quem
 * quer saber se subiu pergunte ao estado (a porta).
 */
export function startSunshine(binary: string): boolean {
  const child = spawn(binary, [], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}