/**
 * Remote Play via Moonlight — o cliente do sistema, encaminhado.
 *
 * O NEXORA HUB não faz *streaming*: quem sabe é o **Moonlight**, binário do
 * sistema. Este módulo encontra-o, corre os comandos dele (emparelhar, listar
 * jogos, jogar) e devolve o resultado. Sem o binário, a resposta diz isso —
 * nenhum botão finge um *stream* que não pode começar.
 *
 * Os comandos e a leitura da lista são do domínio (`@nexora/core/remote`);
 * aqui só correm. O `exec` é injectável: os testes não precisam do Moonlight.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import {
  listArgs,
  MOONLIGHT_BINARIES,
  pairArgs,
  parseMoonlightApps,
  streamArgs,
  type MoonlightApp,
} from '@nexora/core';

const execFileAsync = promisify(execFile);

/** Um executor injectável (a forma do `execFile` prometido). */
export type Runner = (command: string, args: readonly string[]) => Promise<{ stdout: string; stderr: string }>;

/** O executor real (o binário do sistema, com tempo limite). */
async function realRun(command: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(command, args, {
    timeout: 20_000,
    encoding: 'buffer',
    maxBuffer: 4 * 1024 * 1024,
  });
  return { stdout: stdout.toString('utf8'), stderr: stderr.toString('utf8') };
}

/** Procura o binário do Moonlight no PATH (o primeiro que existir). */
export async function findMoonlight(run: Runner = realRun): Promise<string | null> {
  for (const binary of MOONLIGHT_BINARIES) {
    try {
      await run(binary, ['--version']);
      return binary;
    } catch {
      // não está no PATH (ou não executou): tenta o próximo
    }
  }
  return null;
}

/** Emparelha com um anfitrião (o PIN aparece no ecrã do Moonlight). */
export async function pairHost(binary: string, host: string, run: Runner = realRun): Promise<boolean> {
  try {
    await run(binary, pairArgs(host));
    return true;
  } catch {
    return false;
  }
}

/** Os jogos que o anfitrião tem (a lista do Moonlight, lida pelo domínio). */
export async function listApps(binary: string, host: string, run: Runner = realRun): Promise<readonly MoonlightApp[]> {
  try {
    const { stdout } = await run(binary, listArgs(host));
    return parseMoonlightApps(stdout);
  } catch {
    return [];
  }
}

/**
 * Joga um título do anfitrião.
 *
 * O Moonlight é um processo de ecrã inteiro que vive sozinho: o lançamento é
 * *desacoplado* (o launcher não espera pelo fim do jogo).
 */
export function streamApp(binary: string, host: string, appIndex: number): boolean {
  const child = spawn(binary, [...streamArgs(host, appIndex)], { detached: true, stdio: 'ignore' });
  child.unref();
  return true;
}