import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LocalLibrary } from '../src/main/db.js';

/**
 * Base de dados local da biblioteca.
 *
 * O que estes testes travam: importar a mesma pasta duas vezes **não**
 * duplica a entrada (o identificador é o caminho normalizado) e o tempo
 * jogado acumula — a medida do launcher não pode perder-se nem inflar-se.
 */
describe('LocalLibrary', () => {
  let library: LocalLibrary;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-db-'));
    library = new LocalLibrary(join(dir, 'nexora.sqlite'));
  });

  it('cria uma entrada e encontra pelo caminho', () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    const found = library.byExternalKey('c:/games/x');
    expect(found?.title).toBe('X');
  });

  it('não duplica ao reimportar a mesma pasta', () => {
    const input = {
      externalKey: 'c:/games/x',
      title: 'X',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    };
    library.upsert(input);
    library.upsert(input);
    expect(library.list()).toHaveLength(1);
  });

  it('acumula o tempo jogado', () => {
    library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    library.addPlayedSeconds('c:/games/x', 60, new Date().toISOString());
    library.addPlayedSeconds('c:/games/x', 120, new Date().toISOString());
    expect(library.byExternalKey('c:/games/x')?.totalSeconds).toBe(180);
  });

  it('alterna o favorito', () => {
    const record = library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    expect(record.favorite).toBe(false);
    library.setFavorite(record.id, true);
    expect(library.findById(record.id)?.favorite).toBe(true);
  });

  it('remove uma entrada', () => {
    const record = library.upsert({
      externalKey: 'c:/games/x',
      title: 'X',
      installPath: 'C:/Games/X',
      executablePath: 'C:/Games/X/game.exe',
    });
    expect(library.remove(record.id)).toBe(true);
    expect(library.list()).toHaveLength(0);
  });

  it('lista ordenado por título', () => {
    library.upsert({ externalKey: 'b', title: 'Beta', installPath: '/b', executablePath: '/b/b.exe' });
    library.upsert({ externalKey: 'a', title: 'Alfa', installPath: '/a', executablePath: '/a/a.exe' });
    expect(library.list().map((game) => game.title)).toEqual(['Alfa', 'Beta']);
  });

  /**
   * Entrada de catálogo: metadado sem disco.
   *
   * Um jogo encontrado pelo AppID na loja mas não instalado não tem pasta nem
   * executável — e as colunas aceitam `NULL` por causa dele. O teste trava as
   * três regras: a entrada nasce sem caminhos, um caminho real nunca é
   * apagado por uma actualização de catálogo, e o mesmo appid encontrado duas
   * vezes não duplica a biblioteca.
   */
  describe('catálogo (entradas sem instalação)', () => {
    it('guarda uma entrada sem pasta nem executável', () => {
      const record = library.upsert({
        externalKey: 'steam-app:730',
        title: 'Counter-Strike 2',
        cover: 'https://cdn.akamai.steamstatic.com/steam/apps/730/header.jpg',
        steamAppId: '730',
        tags: ['steam'],
      });
      expect(record.installPath).toBeNull();
      expect(record.executablePath).toBeNull();
      expect(record.steamAppId).toBe('730');
    });

    it('uma actualização de catálogo não apaga o caminho real', () => {
      library.upsert({
        externalKey: 'c:/games/x',
        title: 'X',
        installPath: 'C:/Games/X',
        executablePath: 'C:/Games/X/game.exe',
      });
      library.upsert({ externalKey: 'c:/games/x', title: 'X Renomeado' });
      const found = library.byExternalKey('c:/games/x');
      expect(found?.installPath).toBe('C:/Games/X');
      expect(found?.executablePath).toBe('C:/Games/X/game.exe');
    });

    it('encontra pelo appid (o que impede duplicar)', () => {
      const record = library.upsert({
        externalKey: 'steam-app:730',
        title: 'Counter-Strike 2',
        steamAppId: '730',
      });
      expect(library.bySteamAppId('730')?.id).toBe(record.id);
      expect(library.bySteamAppId('999')).toBeNull();
    });

    it('migra uma base antiga (caminhos obrigatórios) sem perder dados', async () => {
      // Uma base escrita antes do catálogo existir: a tabela tem
      // `not null` nos caminhos. Abrir a biblioteca migra-a e mantém tudo.
      const dir = mkdtempSync(join(tmpdir(), 'nexora-db-old-'));
      const path = join(dir, 'nexora.sqlite');
      const old = new DatabaseSync(path);
      old.exec(`
        create table games (
          id integer primary key autoincrement,
          external_key text not null unique,
          title text not null,
          cover text,
          install_path text not null,
          executable_path text not null,
          steam_app_id text,
          tags text not null default '[]',
          adult integer not null default 0,
          favorite integer not null default 0,
          last_played_at text,
          total_seconds integer not null default 0,
          created_at text not null,
          updated_at text not null
        );
        insert into games (external_key, title, cover, install_path, executable_path, favorite, total_seconds, created_at, updated_at)
        values ('c:/games/old', 'Old', null, 'C:/Old', 'C:/Old/game.exe', 1, 90, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      `);
      old.close();

      const migrated = new LocalLibrary(path);
      const entry = migrated.byExternalKey('c:/games/old');
      expect(entry?.title).toBe('Old');
      expect(entry?.favorite).toBe(true);
      expect(entry?.totalSeconds).toBe(90);
      // E a base nova aceita catálogo.
      migrated.upsert({ externalKey: 'steam-app:730', title: 'Counter-Strike 2', steamAppId: '730' });
      expect(migrated.bySteamAppId('730')?.installPath).toBeNull();
      migrated.close();
    });
  });

  /**
   * DLCs — o cruzamento da loja com o disco.
   */
  describe('DLCs', () => {
    it('substitui a lista a cada chamada (sem duplicar)', () => {
      library.upsert({ externalKey: 'c:/games/x', title: 'X' });
      library.setDlcs('c:/games/x', [
        { appId: '598190', title: 'Godmaster', kind: 'dlc', free: true, installed: true },
      ]);
      library.setDlcs('c:/games/x', [
        { appId: '598190', title: 'Godmaster', kind: 'dlc', free: true, installed: false },
        { appId: '916000', title: 'Lifeblood', kind: 'dlc', free: true, installed: false },
      ]);
      const dlcs = library.listDlcs('c:/games/x');
      expect(dlcs.map((dlc) => dlc.title)).toEqual(['Godmaster', 'Lifeblood']);
      expect(dlcs[0]?.installed).toBe(false);
    });

    it('lista vazia para um jogo sem DLCs conhecidas', () => {
      library.upsert({ externalKey: 'c:/games/x', title: 'X' });
      expect(library.listDlcs('c:/games/x')).toEqual([]);
    });
  });
});
