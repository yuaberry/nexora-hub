import { describe, expect, it } from 'vitest';
import { steamClientEnv, steamRunUrl } from '../src/main/steam-client.js';

/**
 * O cliente oficial da Steam — o que o launcher precisa de saber.
 *
 * O que estes testes travam: o URL de arranque é o do cliente oficial; e o
 * ambiente com que o cliente é aberto **não** carrega as variáveis que
 * injudam bibliotecas em processos alheios (`LD_PRELOAD`, `LD_AUDIT`,
 * `LD_LIBRARY_PATH`) nem as ferramentas de terceiros que se marcam no
 * ambiente (`SLS*`) — um cliente aberto com elas arranca, mas não abre jogos.
 */
describe('steamClientEnv', () => {
  it('remove as variáveis que injudam bibliotecas noutros processos', () => {
    // O processo de teste não tem estas variáveis: injectá-las no ambiente
    // do teste seria o mesmo que provar o contrário do que se quer provar.
    process.env['LD_PRELOAD'] = '/caminho/qualquer.so';
    process.env['LD_AUDIT'] = '/home/llinux/.local/share/SLSsteam/SLSsteam.so';
    process.env['LD_LIBRARY_PATH'] = '/outro/caminho';
    process.env['SLSM_SUDO_PRIMED'] = '1';
    process.env['HOME'] = '/home/llinux';
    process.env['DISPLAY'] = ':0';
    const limpo = steamClientEnv('/home/llinux/.local/share/Steam/steam.sh');
    expect(limpo['LD_PRELOAD']).toBeUndefined();
    expect(limpo['LD_AUDIT']).toBeUndefined();
    expect(limpo['LD_LIBRARY_PATH']).toBeUndefined();
    expect(limpo['SLSM_SUDO_PRIMED']).toBeUndefined();
    // O que é legítimo fica: sem isto o cliente não arranca.
    expect(limpo['HOME']).toBe('/home/llinux');
    expect(limpo['DISPLAY']).toBe(':0');
    expect(limpo['PATH']).toContain('/usr/bin');
  });

  it('o PATH ganha o sítio do cliente', () => {
    const limpo = steamClientEnv('/home/llinux/.local/share/Steam/steam.sh');
    expect(limpo['PATH']?.startsWith('/home/llinux/.local/share/Steam')).toBe(true);
  });
});

describe('steamRunUrl', () => {
  it('constrói o URL do cliente oficial', () => {
    expect(steamRunUrl('3241660')).toBe('steam://rungameid/3241660');
    expect(steamRunUrl(' 3241660 ')).toBe('steam://rungameid/3241660');
  });
});