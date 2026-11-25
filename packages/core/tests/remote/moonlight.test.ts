import { describe, expect, it } from 'vitest';
import {
  isHostAddress,
  listArgs,
  MOONLIGHT_BINARIES,
  pairArgs,
  parseMoonlightApps,
  streamArgs,
} from '../../src/remote/moonlight.js';

/**
 * Moonlight — os comandos e a leitura da lista.
 */
describe('comandos', () => {
  it('emparelhar, listar e jogar', () => {
    expect(pairArgs(' 192.168.1.5 ')).toEqual(['pair', '192.168.1.5']);
    expect(listArgs('192.168.1.5')).toEqual(['list', '192.168.1.5']);
    expect(streamArgs('192.168.1.5', 3)).toEqual(['stream', '192.168.1.5', '3']);
  });

  it('os binários conhecidos são o que o sistema costuma ter', () => {
    expect(MOONLIGHT_BINARIES).toContain('moonlight-qt');
    expect(MOONLIGHT_BINARIES).toContain('moonlight');
  });
});

describe('parseMoonlightApps', () => {
  it('lê as linhas N. Nome', () => {
    const saida = `Searching for server...
1. Steam
2. Steam Big Picture
3. Desktop
4. Hollow Knight
`;
    expect(parseMoonlightApps(saida)).toEqual([
      { index: 1, title: 'Steam' },
      { index: 2, title: 'Steam Big Picture' },
      { index: 3, title: 'Desktop' },
      { index: 4, title: 'Hollow Knight' },
    ]);
  });

  it('linhas que não são jogos são ignoradas', () => {
    const saida = `Connect to the server...
Automatic discovery...
1. Steam
Not a game line
`;
    expect(parseMoonlightApps(saida)).toEqual([{ index: 1, title: 'Steam' }]);
  });

  it('saída vazia devolve lista vazia', () => {
    expect(parseMoonlightApps('')).toEqual([]);
  });
});

describe('isHostAddress', () => {
  it('um IPv4 ou um nome de máquina', () => {
    expect(isHostAddress('192.168.1.5')).toBe(true);
    expect(isHostAddress('255.255.255.255')).toBe(true);
    expect(isHostAddress('pc.sala.local')).toBe(true);
    expect(isHostAddress('sala-pc')).toBe(true);
  });

  it('recusa o que não é endereço', () => {
    expect(isHostAddress('999.1.1.1')).toBe(false);
    expect(isHostAddress('http://pc')).toBe(false);
    expect(isHostAddress('com espaços')).toBe(false);
    expect(isHostAddress('')).toBe(false);
    expect(isHostAddress(null)).toBe(false);
  });
});
