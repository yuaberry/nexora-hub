import { describe, expect, it } from 'vitest';
import { findMoonlight, listApps, pairHost, type Runner } from '../src/main/remote-play.js';

/**
 * Remote Play via Moonlight — com um executor falso.
 *
 * O que estes testes travam: sem o binário no PATH, a detecção devolve
 * `null` (a interface diz "não instalado", não finge); com ele, emparelhar e
 * listar passam pelo executável certo; e uma falha do Moonlight devolve
 * resultado vazio, não uma lista inventada.
 */

/** Um executor que simula o Moonlight instalado. */
function fakeInstalled(): Runner {
  return async (_command, args) => {
    if (args[0] === '--version') {
      return { stdout: `moonlight-qt v1.0\n`, stderr: '' };
    }
    if (args[0] === 'list') {
      return { stdout: '1. Steam\n2. Desktop\n3. Hollow Knight\n', stderr: '' };
    }
    return { stdout: '', stderr: '' };
  };
}

/** Um executor onde nada existe. */
const fakeAbsent: Runner = async () => {
  throw new Error('não encontrado');
};

describe('findMoonlight', () => {
  it('encontra o binário quando existe', async () => {
    expect(await findMoonlight(fakeInstalled())).toBe('moonlight-qt');
  });

  it('devolve null quando não há binário', async () => {
    expect(await findMoonlight(fakeAbsent)).toBeNull();
  });
});

describe('pairHost', () => {
  it('emparelha pelo binário certo', async () => {
    let visto: string[] = [];
    const run: Runner = async (command, args) => {
      visto = [command, ...args];
      return { stdout: '', stderr: '' };
    };
    expect(await pairHost('moonlight-qt', '192.168.1.5', run)).toBe(true);
    expect(visto).toEqual(['moonlight-qt', 'pair', '192.168.1.5']);
  });

  it('uma falha de emparelhamento devolve falso', async () => {
    expect(await pairHost('moonlight-qt', '10.0.0.1', fakeAbsent)).toBe(false);
  });
});

describe('listApps', () => {
  it('lê a lista do anfitrião', async () => {
    const apps = await listApps('moonlight-qt', '192.168.1.5', fakeInstalled());
    expect(apps).toEqual([
      { index: 1, title: 'Steam' },
      { index: 2, title: 'Desktop' },
      { index: 3, title: 'Hollow Knight' },
    ]);
  });

  it('um anfitrião que não responde dá lista vazia', async () => {
    expect(await listApps('moonlight-qt', '10.0.0.1', fakeAbsent)).toEqual([]);
  });
});
