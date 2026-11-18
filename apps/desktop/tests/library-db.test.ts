import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
});