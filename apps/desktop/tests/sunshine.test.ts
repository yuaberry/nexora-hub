import { describe, expect, it } from 'vitest';
import { lanAddress, startSunshine, sunshineStatus, type PortCheck, type Runner } from '../src/main/sunshine.js';

/**
 * Sunshine — o anfitrião da máquina, com injectáveis falsos.
 *
 * O que estes testes travam: "está a correr?" é uma pergunta à **porta**
 * (não ao processo); sem binário, o estado diz isso; e o endereço web só
 * existe quando há rede local.
 */

/** Um verificador de porta fixo. */
function porta(responde: boolean): PortCheck {
  return async () => responde;
}

/** Um executor que simula o Sunshine instalado. */
const fakeInstalado: Runner = async (_command, args) => {
  if (args[0] === '--version') {
    return { stdout: `Sunshine version: 2026.1123.40502\n`, stderr: '' };
  }
  return { stdout: '', stderr: '' };
};

/** Um executor onde nada existe. */
const fakeAusente: Runner = async () => {
  throw new Error('não encontrado');
};

describe('sunshineStatus', () => {
  it('instalado, a correr e com endereço', async () => {
    const estado = await sunshineStatus(porta(true), fakeInstalado);
    expect(estado.binary).toBe('sunshine');
    expect(estado.running).toBe(true);
    // O endereço é o desta máquina (ou null sem rede local — nunca inventado).
    if (estado.url !== null) {
      expect(estado.url).toMatch(/^https:\/\/\d+\.\d+\.\d+\.\d+:47990$/);
    }
  });

  it('instalado mas sem a porta a responder: não está a correr', async () => {
    const estado = await sunshineStatus(porta(false), fakeInstalado);
    expect(estado.binary).toBe('sunshine');
    expect(estado.running).toBe(false);
  });

  it('sem binário: o estado diz isso', async () => {
    const estado = await sunshineStatus(porta(true), fakeAusente);
    expect(estado.binary).toBeNull();
  });
});

describe('lanAddress', () => {
  it('devolve um endereço local desta máquina (ou null)', () => {
    const ip = lanAddress();
    if (ip !== null) {
      expect(ip).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    }
  });
});

describe('startSunshine', () => {
  it('o pedido de arranque é feito (desacoplado)', () => {
    // Arrancar o Sunshine real num teste seria lançar um serviço: usamos o
    // `true` do contrato e a prova real fica para a prova ao vivo.
    expect(startSunshine('sunshine')).toBe(true);
  });
});
