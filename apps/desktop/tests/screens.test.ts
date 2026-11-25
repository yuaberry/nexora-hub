import { describe, expect, it, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listScreenshots, removeScreenshot, screenshotsRoot } from '../src/main/screens.js';

/**
 * Capturas — listar e remover, com ficheiros reais.
 *
 * O que estes testes travam: a lista vem da pasta do jogo (as capturas de
 * jogos diferentes não se misturam) e vem vazia quando a pasta não existe;
 * remover apaga o que está na lista e recusa um nome que não está (nada de
 * caminhos inventados).
 */
describe('capturas', () => {
  let userData: string;
  const gameKey = '/home/user/games/Hollow Knight';

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'nexora-screens-'));
  });

  it('lista vazia quando não há capturas', () => {
    expect(listScreenshots(userData, gameKey)).toEqual([]);
  });

  it('lista as capturas da pasta do jogo', () => {
    const folder = join(screenshotsRoot(userData), 'hollow-knight');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'hollow-knight-2026-11-25T14-30-00-000Z.png'), 'png-de-prova');
    const shots = listScreenshots(userData, gameKey);
    expect(shots).toHaveLength(1);
    expect(shots[0]?.fileName).toBe('hollow-knight-2026-11-25T14-30-00-000Z.png');
    expect(shots[0]?.sizeBytes).toBe(12);
    expect(shots[0]?.path).toBe(join(folder, 'hollow-knight-2026-11-25T14-30-00-000Z.png'));
  });

  it('as capturas de outro jogo não aparecem', () => {
    const folder = join(screenshotsRoot(userData), 'hollow-knight');
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'hollow-knight-1.png'), 'x');
    expect(listScreenshots(userData, '/home/user/games/R.E.P.O.')).toEqual([]);
  });

  it('remover apaga o que está na lista', () => {
    const folder = join(screenshotsRoot(userData), 'hollow-knight');
    mkdirSync(folder, { recursive: true });
    const name = 'hollow-knight-2026-11-25T14-30-00-000Z.png';
    writeFileSync(join(folder, name), 'x');
    expect(removeScreenshot(userData, gameKey, name)).toBe(true);
    expect(existsSync(join(folder, name))).toBe(false);
  });

  it('remover um nome que não existe é recusado', () => {
    expect(removeScreenshot(userData, gameKey, 'nao-existe.png')).toBe(false);
  });
});
