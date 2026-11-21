import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalLibrary } from '../src/main/db.js';
import { importOfficial, importSteamLibrary, steamInstalled, steamRoots, steamRunUrl } from '../src/main/official-import.js';

/**
 * Importação oficial — leitura dos manifestos da Steam.
 *
 * O que estes testes travam: o **título real** vem do manifesto (`REPO` →
 * `R.E.P.O.`), as ferramentas da própria Steam nunca entram na biblioteca,
 * um manifesto partido é saltado sem entrada inventada, e uma pasta de jogo
 * que já não existe não pendura a importação.
 */

/** Manifestos no formato que a Steam escreve (fixtures do formato real). */
const MANIFEST = (appId: string, name: string, installDir: string): string =>
  `"AppState"\n{\n\t"appid"\t\t"${appId}"\n\t"Universe"\t\t"1"\n\t"name"\t\t"${name}"\n\t"StateFlags"\t\t"4"\n\t"installdir"\t\t"${installDir}"\n\t"SizeOnDisk"\t\t"123"\n}\n`;

/** Uma raiz Steam de mentira, com os manifestos que o teste quer. */
function fakeSteam(root: string, games: readonly { appId: string; name: string; dir: string }[]): void {
  const steamapps = join(root, 'steamapps');
  const common = join(steamapps, 'common');
  mkdirSync(common, { recursive: true });
  const appLines = games.map((game) => `\t\t\t"${game.appId}"\t\t"123"`).join('\n');
  writeFileSync(
    join(steamapps, 'libraryfolders.vdf'),
    `"libraryfolders"\n{\n\t"0"\n\t{\n\t\t"path"\t\t"${root}"\n\t\t"apps"\n\t\t{\n${appLines}\n\t\t}\n\t}\n}\n`,
    'utf8',
  );
  for (const game of games) {
    writeFileSync(join(steamapps, `appmanifest_${game.appId}.acf`), MANIFEST(game.appId, game.name, game.dir), 'utf8');
    mkdirSync(join(common, game.dir), { recursive: true });
    // Um executável plausível dentro da pasta do jogo.
    writeFileSync(join(common, game.dir, 'game.sh'), '#!/bin/sh\n', 'utf8');
  }
}

describe('importSteamLibrary', () => {
  let dir: string;
  let library: LocalLibrary;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-steam-'));
    library = new LocalLibrary(join(dir, 'nexora.sqlite'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('importa com o título real do manifesto', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [
      { appId: '3241660', name: 'R.E.P.O.', dir: 'REPO' },
      { appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' },
    ]);
    const report = importSteamLibrary(library, [root]);
    expect(report.titles).toEqual(['R.E.P.O.', 'Hollow Knight']);
    expect(report.skipped).toBe(0);
    // A pasta continua a ser a do jogo; o título é o da loja.
    const entries = library.list() as readonly { title: string; installPath: string }[];
    expect(entries.map((entry) => entry.title).sort()).toEqual(['Hollow Knight', 'R.E.P.O.']);
  });

  it('as ferramentas da Steam nunca entram', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [
      { appId: '1493710', name: 'Proton Experimental', dir: 'Proton - Experimental' },
      { appId: '1628350', name: 'Steam Linux Runtime 4.0', dir: 'SteamLinuxRuntime_4' },
      { appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' },
    ]);
    const report = importSteamLibrary(library, [root]);
    expect(report.titles).toEqual(['Hollow Knight']);
    // Jogo + duas ferramentas + manifestos das ferramentas: só o jogo entra.
    expect(report.skipped).toBe(2);
    expect(library.list()).toHaveLength(1);
  });

  it('manifesto partido é saltado, sem entrada inventada', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [{ appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' }]);
    // Um manifesto truncado a meio (a Steam escreve temporários enquanto
    // baixa): o parser recusa, e a importação salta o ficheiro.
    rmSync(join(root, 'steamapps', 'appmanifest_367520.acf'));
    writeFileSync(join(root, 'steamapps', 'appmanifest_9999999.acf'), '"AppState"\n{\n\t"appid" "9999999"\n\t"name" "Partido"\n');
    const report = importSteamLibrary(library, [root]);
    expect(report.titles).toEqual([]);
    expect(report.skipped).toBe(1);
    expect(library.list()).toHaveLength(0);
  });

  it('jogo cuja pasta já não existe é ignorado', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [{ appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' }]);
    rmSync(join(root, 'steamapps', 'common', 'Hollow Knight'), { recursive: true, force: true });
    const report = importSteamLibrary(library, [root]);
    expect(report.titles).toEqual([]);
    expect(report.skipped).toBe(1);
  });

  it('raiz sem libraryfolders não dá nada (e não falha)', () => {
    const root = join(dir, 'Vazio');
    mkdirSync(root, { recursive: true });
    const report = importSteamLibrary(library, [root]);
    expect(report.titles).toEqual([]);
    expect(report.reasonKey).toBe('official.reason.notFound');
  });

  it('importar duas vezes não duplica nem repete no relatório', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [{ appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' }]);
    importSteamLibrary(library, [root]);
    const again = importSteamLibrary(library, [root]);
    expect(again.titles).toEqual(['Hollow Knight']);
    expect(library.list()).toHaveLength(1);
  });

  it('raízes duplicadas (o ~/.steam é atalho) não duplicam a leitura', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [{ appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' }]);
    const report = importSteamLibrary(library, [root, root]);
    expect(report.titles).toEqual(['Hollow Knight']);
  });
});

describe('importOfficial', () => {
  let dir: string;
  let library: LocalLibrary;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-official-'));
    library = new LocalLibrary(join(dir, 'nexora.sqlite'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('relata Epic e GOG como formato por verificar', () => {
    const root = join(dir, 'Steam');
    fakeSteam(root, [{ appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' }]);
    const view = importOfficial(library, [root]);
    expect(view.imported).toEqual(['Hollow Knight']);
    const epic = view.stores.find((entry) => entry.store === 'epic');
    expect(epic?.reasonKey).toBe('official.reason.unverified');
    const gog = view.stores.find((entry) => entry.store === 'gog');
    expect(gog?.reasonKey).toBe('official.reason.unverified');
  });
});

describe('diagnóstico', () => {
  it('as raízes conhecidas cobrem nativo, flatpak e snap', () => {
    const roots = steamRoots();
    expect(roots).toHaveLength(4);
    expect(roots.some((root) => root.endsWith('.steam/steam'))).toBe(true);
    expect(roots.some((root) => root.includes('com.valvesoftware.Steam'))).toBe(true);
  });

  it('steamInstalled é falso sem manifestos', () => {
    expect(steamInstalled([join(tmpdir(), 'nao-existe-nexora')])).toBe(false);
  });
});
describe('steamRunUrl', () => {
  it('constrói o URL do protocolo da Steam', () => {
    expect(steamRunUrl('367520')).toBe('steam://rungameid/367520');
  });

  it('recusa o que não é appid', () => {
    expect(steamRunUrl(null)).toBeNull();
    expect(steamRunUrl('abc')).toBeNull();
    expect(steamRunUrl('36 7520')).toBeNull();
    expect(steamRunUrl('')).toBeNull();
  });

  it('o appid do manifesto é o que o URL usa', () => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-appid-'));
    try {
      const root = join(dir, 'Steam');
      fakeSteam(root, [{ appId: '367520', name: 'Hollow Knight', dir: 'Hollow Knight' }]);
      const library = new LocalLibrary(join(dir, 'nexora.sqlite'));
      importSteamLibrary(library, [root]);
      const entry = library.list()[0];
      expect(entry?.steamAppId).toBe('367520');
      expect(steamRunUrl(entry?.steamAppId ?? null)).toBe('steam://rungameid/367520');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
