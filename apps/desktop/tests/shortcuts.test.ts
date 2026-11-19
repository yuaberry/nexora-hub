import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDesktopEntry, desktopFilePath, installDesktopShortcut } from '../src/main/shortcuts.js';

/**
 * Atalhos de desktop.
 *
 * O que estes testes travam: o ficheiro `.desktop` aponta para o executável
 * do utilizador (nunca para outro sítio), o nome do ficheiro é seguro para o
 * disco, e a escrita cria a pasta quando ela não existe.
 */

/** Pedido base de teste. */
function request(): { readonly name: string; readonly exec: string } {
  return { name: 'League Of Legends', exec: '/jogos/league/league.exe' };
}

describe('buildDesktopEntry', () => {
  it('aponta o Exec para o executável do utilizador', () => {
    const entry = buildDesktopEntry(request());
    expect(entry).toContain('[Desktop Entry]');
    expect(entry).toContain('Exec=/jogos/league/league.exe %F');
    expect(entry).toContain('Name=League Of Legends');
    expect(entry).toContain('Categories=Game;');
  });

  it('inclui o ícone só quando ele existe', () => {
    expect(buildDesktopEntry({ name: 'X', exec: '/x', icon: '/x/icon.png' })).toContain('Icon=/x/icon.png');
    expect(buildDesktopEntry({ name: 'X', exec: '/x' })).not.toContain('Icon=');
  });

  it('não deixa newlines quebrar o ficheiro', () => {
    const entry = buildDesktopEntry({ name: 'Jogo\nMalicioso', exec: '/x' });
    const lines = entry.split('\n');
    for (const line of lines) {
      expect(line.includes('\r')).toBe(false);
    }
    expect(entry).toContain('Name=Jogo Malicioso');
  });
});

describe('desktopFilePath', () => {
  it('gera um nome seguro a partir do título', () => {
    expect(desktopFilePath('/apps', 'League Of Legends')).toBe('/apps/nexora-hub-league-of-legends.desktop');
    // O slug não pode conter barra: 'A/B\\C:D' vira um nome de ficheiro único.
    const path = desktopFilePath('/apps', 'A/B\\C:D');
    const file = path.slice(path.lastIndexOf('/') + 1);
    expect(file).not.toContain('/');
    expect(file.endsWith('.desktop')).toBe(true);
  });
});

describe('installDesktopShortcut', () => {
  it('escreve o ficheiro e cria a pasta quando não existe', () => {
    const root = mkdtempSync(join(tmpdir(), 'nexora-shortcut-'));
    try {
      const appsDir = join(root, 'nao-existe', 'applications');
      const result = installDesktopShortcut(request(), appsDir);
      expect(result.ok).toBe(true);
      if (!result.ok) {
        return;
      }
      const written = readFileSync(result.path, 'utf8');
      expect(written).toContain('Exec=/jogos/league/league.exe');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('substitui um atalho existente sem erro', () => {
    const appsDir = mkdtempSync(join(tmpdir(), 'nexora-shortcut-'));
    try {
      expect(installDesktopShortcut(request(), appsDir).ok).toBe(true);
      expect(installDesktopShortcut(request(), appsDir).ok).toBe(true);
      writeFileSync(desktopFilePath(appsDir, 'League Of Legends'), 'lixo');
      expect(installDesktopShortcut(request(), appsDir).ok).toBe(true);
    } finally {
      rmSync(appsDir, { force: true, recursive: true });
    }
  });
});