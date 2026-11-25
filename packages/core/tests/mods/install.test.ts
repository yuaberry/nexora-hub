import { describe, expect, it } from 'vitest';
import { MAX_MOD_BYTES, planModInstall } from '../../src/mods/install.js';

/**
 * Instalação de modos — o plano antes de copiar.
 *
 * O que estes testes travam: só entra um `.jar` (ou `.jar.disabled`); um nome
 * que já existe não é substituído em silêncio; o tamanho tem limite; e uma
 * pasta em falta recusa sem fingir destino.
 */
function pedido(overrides: Partial<Parameters<typeof planModInstall>[0]> = {}) {
  return {
    fileName: 'sodium.jar',
    sizeBytes: 1_000,
    existing: [],
    targetFolder: '/games/x/mods',
    ...overrides,
  };
}

describe('planModInstall', () => {
  it('um jar novo entra', () => {
    expect(planModInstall(pedido())).toEqual({ ok: true, fileName: 'sodium.jar' });
  });

  it('um jar desactivado também entra (é assim que se desliga um modo)', () => {
    expect(planModInstall(pedido({ fileName: 'sodium.jar.disabled' })).ok).toBe(true);
  });

  it('um ficheiro que não é modo é recusado', () => {
    expect(planModInstall(pedido({ fileName: 'jogo.zip' }))).toEqual({ ok: false, reason: 'not-a-mod' });
    expect(planModInstall(pedido({ fileName: 'leitura.txt' }))).toEqual({ ok: false, reason: 'not-a-mod' });
  });

  it('um nome que já existe não é substituído em silêncio', () => {
    expect(planModInstall(pedido({ existing: ['SODIUM.JAR'] }))).toEqual({
      ok: false,
      reason: 'already-exists',
    });
  });

  it('o tamanho tem limite declarado', () => {
    expect(planModInstall(pedido({ sizeBytes: MAX_MOD_BYTES })).ok).toBe(true);
    expect(planModInstall(pedido({ sizeBytes: MAX_MOD_BYTES + 1 }))).toEqual({ ok: false, reason: 'too-large' });
  });

  it('sem pasta de mods não há destino', () => {
    expect(planModInstall(pedido({ targetFolder: null }))).toEqual({ ok: false, reason: 'no-folder' });
  });
});
