/**
 * IPC do Remote Play — detectar, emparelhar, listar e jogar.
 *
 * Canal fino para o Moonlight do sistema: o renderer pede, o processo
 * principal corre o binário. Nada de *stream* fingido — sem o binário, a
 * detecção devolve `null` e a interface diz o que falta.
 */

import { ipcMain } from 'electron';
import { isHostAddress, type MoonlightApp } from '@nexora/core';
import { findMoonlight, listApps, pairHost, streamApp } from './remote-play.js';
import { findSunshine, startSunshine, sunshineStatus } from './sunshine.js';

/** Regista os canais do Remote Play. */
export function registerRemotePlayIpc(): void {
  // O binário do Moonlight está no sistema?
  ipcMain.handle('remotePlay:detect', async (): Promise<{ readonly binary: string | null }> => {
    return { binary: await findMoonlight() };
  });

  // Emparelhar com um anfitrião (o PIN aparece no ecrã do Moonlight).
  ipcMain.handle('remotePlay:pair', async (_event, host: unknown): Promise<{ readonly ok: boolean }> => {
    if (!isHostAddress(host)) {
      return { ok: false };
    }
    const binary = await findMoonlight();
    if (binary === null) {
      return { ok: false };
    }
    return { ok: await pairHost(binary, host.trim()) };
  });

  // Os jogos do anfitrião (a lista do Moonlight).
  ipcMain.handle('remotePlay:apps', async (_event, host: unknown): Promise<{
    readonly ok: boolean;
    readonly items?: readonly MoonlightApp[];
  }> => {
    if (!isHostAddress(host)) {
      return { ok: false };
    }
    const binary = await findMoonlight();
    if (binary === null) {
      return { ok: false };
    }
    return { ok: true, items: await listApps(binary, host.trim()) };
  });

  // O estado do anfitrião desta máquina (Sunshine instalado? a correr? endereço).
  ipcMain.handle('remotePlay:sunshine', async (): Promise<{
    readonly ok: boolean;
    readonly binary: string | null;
    readonly running: boolean;
    readonly url: string | null;
  }> => {
    const estado = await sunshineStatus();
    return { ok: true, ...estado };
  });

  // Dá o anfitrião a arrancar (o Sunshine vive sozinho).
  ipcMain.handle('remotePlay:sunshineStart', async (): Promise<{ readonly ok: boolean }> => {
    const binary = await findSunshine();
    if (binary === null) {
      return { ok: false };
    }
    return { ok: startSunshine(binary) };
  });

  // Jogar um título do anfitrião (o Moonlight vive sozinho, desacoplado).
  ipcMain.handle('remotePlay:stream', async (_event, host: unknown, appIndex: unknown): Promise<{ readonly ok: boolean }> => {
    if (!isHostAddress(host) || typeof appIndex !== 'number' || !Number.isInteger(appIndex) || appIndex < 1) {
      return { ok: false };
    }
    const binary = await findMoonlight();
    if (binary === null) {
      return { ok: false };
    }
    return { ok: streamApp(binary, host, appIndex) };
  });
}
