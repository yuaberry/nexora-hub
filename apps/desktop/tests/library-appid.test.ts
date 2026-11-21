import { describe, expect, it, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalLibrary } from '../src/main/db.js';

/**
 * Appid da Steam na base local.
 *
 * O que estes testes travam: o appid do manifesto é guardado (é o que
 * permite o handoff para o cliente oficial), e uma entrada sem appid —
 * importada por pasta — mantém-se sem ele, sem inventar um número.
 */
describe('steamAppId', () => {
  let library: LocalLibrary;

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), 'nexora-appid-'));
    library = new LocalLibrary(join(dir, 'nexora.sqlite'));
  });

  it('guarda o appid dado', () => {
    const entry = library.upsert({
      externalKey: '/jogos/hk',
      title: 'Hollow Knight',
      installPath: '/jogos/hk',
      executablePath: '/jogos/hk/game.sh',
      steamAppId: '367520',
    });
    expect(entry.steamAppId).toBe('367520');
    expect(library.byExternalKey('/jogos/hk')?.steamAppId).toBe('367520');
  });

  it('sem appid fica null (importada por pasta)', () => {
    const entry = library.upsert({
      externalKey: '/jogos/outro',
      title: 'Outro',
      installPath: '/jogos/outro',
      executablePath: '/jogos/outro/game.sh',
    });
    expect(entry.steamAppId).toBeNull();
  });

  it('uma actualização sem appid mantém o que já estava', () => {
    library.upsert({
      externalKey: '/jogos/hk',
      title: 'Hollow Knight',
      installPath: '/jogos/hk',
      executablePath: '/jogos/hk/game.sh',
      steamAppId: '367520',
    });
    // O scan de disco passa sem appid: o que veio do manifesto não se perde.
    library.upsert({
      externalKey: '/jogos/hk',
      title: 'Hollow Knight',
      installPath: '/jogos/hk',
      executablePath: '/jogos/hk/game.sh',
    });
    expect(library.byExternalKey('/jogos/hk')?.steamAppId).toBe('367520');
  });
});
