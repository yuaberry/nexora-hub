import { describe, expect, it } from 'vitest';
import {
  isLanAddress,
  SUNSHINE_PORTS,
  SUNSHINE_WEB_PORT,
  SUNSHINE_BINARIES,
  sunshineWebUrl,
} from '../../src/remote/sunshine.js';

/**
 * Sunshine — as portas, o endereço web e a rede local.
 */
describe('sunshineWebUrl', () => {
  it('é HTTPS na porta documentada', () => {
    expect(sunshineWebUrl('192.168.1.5')).toBe('https://192.168.1.5:47990');
    expect(sunshineWebUrl(' 10.0.0.2 ')).toBe('https://10.0.0.2:47990');
  });
});

describe('isLanAddress', () => {
  it('as três gamas privadas e a de ligação local', () => {
    expect(isLanAddress('192.168.1.5')).toBe(true);
    expect(isLanAddress('10.0.0.2')).toBe(true);
    expect(isLanAddress('172.16.4.9')).toBe(true);
    expect(isLanAddress('172.31.255.9')).toBe(true);
    expect(isLanAddress('169.254.1.1')).toBe(true);
  });

  it('um endereço público ou inválido não é da rede local', () => {
    expect(isLanAddress('8.8.8.8')).toBe(false);
    expect(isLanAddress('172.15.0.1')).toBe(false); // abaixo de /12
    expect(isLanAddress('172.32.0.1')).toBe(false); // acima de /12
    expect(isLanAddress('999.1.1.1')).toBe(false);
    expect(isLanAddress('localhost')).toBe(false);
    expect(isLanAddress(null)).toBe(false);
  });
});

describe('constantes', () => {
  it('as portas documentadas e a web', () => {
    expect(SUNSHINE_WEB_PORT).toBe(47990);
    expect(SUNSHINE_PORTS).toContain(47990);
    expect(SUNSHINE_BINARIES).toContain('sunshine');
  });
});
