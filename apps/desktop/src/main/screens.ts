/**
 * Capturas de ecrã — o clique, o ficheiro e a pasta.
 *
 * A captura é do **ecrã inteiro**: um jogo a correr está no ecrã, e capturar
 * a janela do launcher não mostraria o jogo. O ficheiro fica onde as regras
 * mandam (a pasta do jogo, dentro das capturas do utilizador) e é servido à
 * interface pelo mesmo caminho das capas (`nexora://cover/…` — o protocolo
 * serve imagens do disco, e uma captura é uma imagem).
 *
 * Nada aqui sabe da nuvem: capturar, listar e remover são locais. A subida
 * para a conta é outra rota.
 */

import { mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { desktopCapturer } from 'electron';
import { isScreenshotAcceptable, screenshotFileName, screenshotFolder } from '@nexora/core';

/** Uma captura guardada (o que a interface vê). */
export interface ScreenshotView {
  readonly fileName: string;
  readonly sizeBytes: number;
  /** ISO-8601 UTC da modificação do ficheiro. */
  readonly createdAt: string;
  /** O caminho completo (a interface serve-o pelo esquema interno). */
  readonly path: string;
}

/** A raiz das capturas (dentro dos dados do utilizador). */
export function screenshotsRoot(userDataPath: string): string {
  return join(userDataPath, 'screenshots');
}

/** Captura o ecrã e guarda-o na pasta do jogo. */
export async function captureScreenshot(userDataPath: string, gameKey: string): Promise<ScreenshotView | null> {
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1920, height: 1080 } });
  const screen = sources[0];
  if (screen === undefined) {
    return null;
  }
  const png = screen.thumbnail.toPNG();
  const at = new Date().toISOString();
  const fileName = screenshotFileName(gameKey, at);
  if (!isScreenshotAcceptable(fileName, png.byteLength)) {
    return null;
  }
  const folder = join(screenshotsRoot(userDataPath), screenshotFolder(gameKey));
  try {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, fileName), png);
  } catch {
    return null;
  }
  return { fileName, sizeBytes: png.byteLength, createdAt: at, path: join(folder, fileName) };
}

/** As capturas de um jogo (das mais recentes para as mais antigas). */
export function listScreenshots(userDataPath: string, gameKey: string): readonly ScreenshotView[] {
  const folder = join(screenshotsRoot(userDataPath), screenshotFolder(gameKey));
  let names: readonly string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  return names
    .map((fileName) => {
      const path = join(folder, fileName);
      try {
        const stats = statSync(path);
        return { fileName, sizeBytes: stats.size, createdAt: stats.mtime.toISOString(), path };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is ScreenshotView => entry !== null)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Apaga uma captura (o nome é validado contra a lista do jogo). */
export function removeScreenshot(userDataPath: string, gameKey: string, fileName: string): boolean {
  const folder = join(screenshotsRoot(userDataPath), screenshotFolder(gameKey));
  // Um nome que não está na lista não é apagado: nada de caminos inventados.
  const known = listScreenshots(userDataPath, gameKey).some((shot) => shot.fileName === fileName);
  if (!known) {
    return false;
  }
  try {
    unlinkSync(join(folder, fileName));
    return true;
  } catch {
    return false;
  }
}