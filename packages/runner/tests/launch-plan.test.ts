import { describe, expect, it } from 'vitest';
import { resolveLaunchPlan, winePrefixPath, type LaunchContext } from '../src/index.js';
import type { LaunchRequest } from '../src/index.js';

/**
 * Plano de arranque.
 *
 * O que estes testes travam: um `.exe` no Linux **exige** Wine (e sem Wine é
 * recusado com motivo, não fingido), o prefixo é por jogo, e um executável
 * nativo não é envolvido em camada nenhuma.
 */

/** Pedido base. */
function request(overrides: Partial<LaunchRequest> = {}): LaunchRequest {
  return { gameId: 'meu-jogo', executablePath: '/jogos/meu-jogo/jogo', ...overrides };
}

/** Contexto Linux com Wine. */
const linuxWithWine: LaunchContext = { platform: 'linux', winePath: '/usr/bin/wine', winePrefixRoot: '/prefixos' };

/** Contexto Linux sem Wine. */
const linuxWithoutWine: LaunchContext = { platform: 'linux', winePath: null, winePrefixRoot: '/prefixos' };
const linuxWithGameMode: LaunchContext = { ...linuxWithWine, gameModePath: '/usr/games/gamemoderun' };

describe('resolveLaunchPlan', () => {
  it('um executável nativo é invocado directamente', () => {
    const plan = resolveLaunchPlan(request({ executablePath: '/jogos/x/jogo' }), linuxWithWine);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.layer).toBe('native');
    expect(plan.command).toBe('/jogos/x/jogo');
    expect(plan.args).toEqual([]);
    expect(plan.env).toEqual({});
  });

  it('um .exe no Linux é envolvido pelo Wine', () => {
    const plan = resolveLaunchPlan(request({ executablePath: '/jogos/x/jogo.exe' }), linuxWithWine);
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.layer).toBe('wine');
    expect(plan.command).toBe('/usr/bin/wine');
    expect(plan.args[0]).toBe('/jogos/x/jogo.exe');
    expect(plan.env['WINEPREFIX']).toBe('/prefixos/meu-jogo');
  });

  it('um .exe no Linux sem Wine é recusado com motivo', () => {
    const plan = resolveLaunchPlan(request({ executablePath: '/jogos/x/jogo.exe' }), linuxWithoutWine);
    expect(plan.ok).toBe(false);
    if (plan.ok) {
      return;
    }
    expect(plan.reasonKey).toBe('no-runner');
    expect(plan.reason).toContain('Wine não encontrado');
  });

  it('um .exe no Windows corre directo (não há camada)', () => {
    const plan = resolveLaunchPlan(
      request({ executablePath: 'C:/Jogos/x/jogo.exe' }),
      { platform: 'win32', winePath: null, winePrefixRoot: 'C:/prefixos' },
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.layer).toBe('native');
  });

  it('o prefixo Wine é por jogo (dois jogos, dois prefixos)', () => {
    const first = resolveLaunchPlan(request({ gameId: 'jogo-a', executablePath: '/j/a.exe' }), linuxWithWine);
    const second = resolveLaunchPlan(request({ gameId: 'jogo-b', executablePath: '/j/b.exe' }), linuxWithWine);
    if (!first.ok || !second.ok) {
      throw new Error('planos deveriam ser válidos');
    }
    expect(first.env['WINEPREFIX']).not.toBe(second.env['WINEPREFIX']);
  });

  it('preserva os argumentos do pedido', () => {
    const plan = resolveLaunchPlan(
      request({ executablePath: '/jogos/x/jogo', args: ['--janela', '--cheats'] }),
      linuxWithWine,
    );
    if (!plan.ok) {
      throw new Error('plano deveria ser válido');
    }
    expect(plan.args).toEqual(['--janela', '--cheats']);
  });
});
describe('winePrefixPath', () => {
  it('dá uma pasta segura por jogo (caminhos viram nome de pasta)', () => {
    expect(winePrefixPath('/prefixos', '/home/utilizador/Jogos/Hollow Knight')).toBe(
      '/prefixos/home-utilizador-jogos-hollow-knight',
    );
  });

  it('encurta nomes longos e nunca devolve uma pasta vazia', () => {
    const longo = '/prefixos/' + 'x'.repeat(300);
    expect(winePrefixPath('/prefixos', 'x'.repeat(300)).length).toBeLessThan(longo.length);
    expect(winePrefixPath('/prefixos', '///')).toBe('/prefixos/jogo');
  });

  it('o plano e a pasta preparada usam o mesmo caminho', () => {
    const plan = resolveLaunchPlan(
      { gameId: '/jogos/Hollow Knight', executablePath: '/jogos/Hollow Knight/hollow_knight.exe' },
      linuxWithWine,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    // A correcção do bug: quem cria a pasta tem de criar a que o plano usa.
    expect(plan.env['WINEPREFIX']).toBe(winePrefixPath('/prefixos', '/jogos/Hollow Knight'));
  });
});

describe('GameMode no plano de arranque', () => {
  it('embreula o executável nativo quando o GameMode existe', () => {
    const plan = resolveLaunchPlan({ gameId: 'jogo', executablePath: '/jogos/jogo.sh' }, {
      platform: 'linux',
      winePath: null,
      winePrefixRoot: '/prefixos',
      gameModePath: '/usr/games/gamemoderun',
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.command).toBe('/usr/games/gamemoderun');
    expect(plan.args).toEqual(['/jogos/jogo.sh']);
    // A camada continua a ser a do jogo — o embrulho não a substitui.
    expect(plan.layer).toBe('native');
  });

  it('empresta o Wine por baixo do GameMode, sem perder o prefixo', () => {
    const plan = resolveLaunchPlan(
      { gameId: '/jogos/hollow knight', executablePath: '/jogos/hollow knight/hollow_knight.exe' },
      linuxWithGameMode,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) {
      return;
    }
    expect(plan.command).toBe('/usr/games/gamemoderun');
    expect(plan.args[0]).toBe('/usr/bin/wine');
    expect(plan.args[1]).toBe('/jogos/hollow knight/hollow_knight.exe');
    // O ambiente do prefixo sobrevive ao embrulho — é o que faz o jogo correr.
    expect(plan.env['WINEPREFIX']).toBe(winePrefixPath('/prefixos', '/jogos/hollow knight'));
    expect(plan.layer).toBe('wine');
  });

  it('sem GameMode o plano é o de sempre (nada fingido)', () => {
    const semGameMode = resolveLaunchPlan(
      { gameId: 'jogo', executablePath: '/jogos/jogo.sh' },
      { platform: 'linux', winePath: null, winePrefixRoot: '/prefixos' },
    );
    const comGameMode = resolveLaunchPlan(
      { gameId: 'jogo', executablePath: '/jogos/jogo.sh' },
      { platform: 'linux', winePath: null, winePrefixRoot: '/prefixos', gameModePath: null },
    );
    expect(JSON.stringify(semGameMode)).toBe(JSON.stringify(comGameMode));
  });
});
