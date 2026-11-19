import { describe, expect, it } from 'vitest';
import { isKnownToolFolder } from '../src/main/scan-filter.js';

/**
 * Filtro do scan — o que não é jogo.
 *
 * A lista é declarada, e o teste fixa-a: uma entrada nova entra com o seu
 * teste. O que o teste também trava é a **falta** de excesso: um jogo normal
 * nunca deve ser excluído por causa de uma palavra genérica.
 */

describe('isKnownToolFolder', () => {
  it('exclui as ferramentas que o Steam guarda em steamapps/common', () => {
    expect(isKnownToolFolder('Proton Experimental')).toBe(true);
    expect(isKnownToolFolder('Proton 11 0')).toBe(true);
    expect(isKnownToolFolder('SteamLinuxRuntime 4.0')).toBe(true);
    expect(isKnownToolFolder('_CommonRedist')).toBe(true);
    expect(isKnownToolFolder('Steamworks Shared')).toBe(true);
  });

  it('não exclui jogos por palavras genéricas', () => {
    expect(isKnownToolFolder('Hollow Knight')).toBe(false);
    expect(isKnownToolFolder('League Of Legends')).toBe(false);
    expect(isKnownToolFolder('Vulkan Rising')).toBe(false);
    expect(isKnownToolFolder('DirectX Racers')).toBe(false);
    expect(isKnownToolFolder('Cyberpunk 2077')).toBe(false);
  });
});
