import { describe, expect, it } from 'vitest';
import { detectExecutable, nameMatchesFolder, rankExecutables, scoreExecutable } from '../src/main/scan.js';
import {
  externalKeyFor,
  isExecutableName,
  isNonGameExecutable,
  prettyFolderName,
} from '../src/main/naming.js';

/**
 * Detecção do executável de uma pasta.
 *
 * O que estes testes travam: o launcher **não arranca** instaladores nem
 * desinstaladores — o defeito clássico de um launcher que escolhe o primeiro
 * `.exe` que encontra. E o título da pasta nunca é inventado: vem do nome
 * que o utilizador deu.
 */
describe('rankExecutables', () => {
  it('prefere o executável do jogo ao desinstalador', () => {
    const ranked = rankExecutables([
      { path: 'C:/X/unins000.exe', name: 'unins000.exe' },
      { path: 'C:/X/game.exe', name: 'game.exe' },
    ]);
    expect(ranked[0]?.candidate.name).toBe('game.exe');
  });

  it('ignora ficheiros que não são executáveis', () => {
    const ranked = rankExecutables([
      { path: 'C:/X/readme.txt', name: 'readme.txt' },
      { path: 'C:/X/data.dll', name: 'data.dll' },
    ]);
    expect(ranked).toHaveLength(0);
  });

  it('detecta binários Linux', () => {
    const detected = detectExecutable([
      { path: '/opt/x/README', name: 'README' },
      { path: '/opt/x/run', name: 'run' },
      { path: '/opt/x/start.sh', name: 'start.sh' },
    ]);
    // O README não tem extensão de executável e o `run` também não: o
    // candidato válido é o script — e a detecção nunca adivinha o resto.
    expect(detected?.name).toBe('start.sh');
  });
});

describe('detectExecutable', () => {
  it('devolve null quando não há candidatos', () => {
    expect(detectExecutable([])).toBeNull();
  });

  it('devolve null quando o único candidato é um instalador', () => {
    expect(detectExecutable([{ path: 'C:/X/setup.exe', name: 'setup.exe' }])).toBeNull();
  });

  it('escolhe o jogo entre vários candidatos', () => {
    const detected = detectExecutable([
      { path: 'C:/X/vcredist_x64.exe', name: 'vcredist_x64.exe' },
      { path: 'C:/X/unitycrash handler64.exe', name: 'unitycrash handler64.exe' },
      { path: 'C:/X/Bin/Game.exe', name: 'Game.exe' },
    ]);
    expect(detected?.name).toBe('Game.exe');
  });
});

describe('naming', () => {
  it('normaliza o identificador do caminho', () => {
    expect(externalKeyFor('C:\\Games\\X\\')).toBe('c:/games/x');
  });

  it('dá um título legível ao nome da pasta', () => {
    expect(prettyFolderName('C:/Games/league-of-legends_v2')).toBe('League Of Legends V2');
  });

  it('recupera de um caminho vazio', () => {
    expect(prettyFolderName('C:/')).toBe('Jogo local');
  });

  it('reconhece executáveis', () => {
    expect(isExecutableName('Game.exe')).toBe(true);
    expect(isExecutableName('Game.x86_64')).toBe(true);
    expect(isExecutableName('Game.sh')).toBe(true);
    expect(isExecutableName('Game.dll')).toBe(false);
  });

  it('reconhece não-jogos', () => {
    expect(isNonGameExecutable('unins000.exe')).toBe(true);
    expect(isNonGameExecutable('crash reporter.exe')).toBe(true);
    expect(isNonGameExecutable('Game.exe')).toBe(false);
  });

  it('pontua um jogo acima de um instalador', () => {
    expect(scoreExecutable({ path: 'C:/X/game.exe', name: 'game.exe' })).toBeGreaterThan(
      scoreExecutable({ path: 'C:/X/setup.exe', name: 'setup.exe' }),
    );
  });
});
describe('nameMatchesFolder', () => {
  it('reconhece o executável do jogo pelo nome da pasta', () => {
    expect(nameMatchesFolder('hollow_knight.exe', 'Hollow Knight')).toBe(true);
    expect(nameMatchesFolder('leagueoflegends.exe', 'league-of-legends')).toBe(true);
    expect(nameMatchesFolder('REPO.exe', 'REPO')).toBe(true);
  });

  it('não confunde ferramentas de terceiros com o jogo', () => {
    expect(nameMatchesFolder('bridge.exe', 'league-of-legends')).toBe(false);
    expect(nameMatchesFolder('unins000.exe', 'qualquer jogo')).toBe(false);
  });
});

describe('scoreExecutable com contexto de pasta', () => {
  it('prefere o executável que combina com a pasta', () => {
    const loL = scoreExecutable({ path: '/p/leagueoflegends.exe', name: 'leagueoflegends.exe' }, 0, 'league-of-legends');
    const discord = scoreExecutable({ path: '/p/bridge.exe', name: 'bridge.exe' }, 0, 'league-of-legends');
    expect(loL).toBeGreaterThan(discord);
  });
});
