import { describe, expect, it } from 'vitest';
import {
  isScreenshotAcceptable,
  MAX_SCREENSHOT_BYTES,
  screenshotFileName,
  screenshotFolder,
} from '../../src/screens/rules.js';

/**
 * Capturas — o nome, a pasta e o que a nuvem aceita.
 */
describe('screenshotFileName', () => {
  it('o nome é do jogo e do instante', () => {
    expect(screenshotFileName('/home/user/games/Hollow Knight', '2026-11-25T14:30:00.000Z')).toBe(
      'hollow-knight-2026-11-25T14-30-00-000Z.png',
    );
  });

  it('um jogo sem nome aproveitável fica jogo', () => {
    expect(screenshotFileName('///', '2026-11-25T14:30:00.000Z')).toBe('jogo-2026-11-25T14-30-00-000Z.png');
  });
});

describe('screenshotFolder', () => {
  it('a pasta é o jogo em minúsculas', () => {
    expect(screenshotFolder('/home/user/games/Hollow Knight')).toBe('hollow-knight');
    expect(screenshotFolder('')).toBe('jogo');
  });
});

describe('isScreenshotAcceptable', () => {
  it('uma imagem dentro do limite', () => {
    expect(isScreenshotAcceptable('jogo-1.png', 2 * 1024 * 1024)).toBe(true);
    expect(isScreenshotAcceptable('foto.JPEG', 1000)).toBe(true);
  });

  it('um ficheiro grande ou que não é imagem é recusado', () => {
    expect(isScreenshotAcceptable('jogo-1.png', MAX_SCREENSHOT_BYTES + 1)).toBe(false);
    expect(isScreenshotAcceptable('jogo.zip', 1000)).toBe(false);
  });
});
