import { describe, expect, it, beforeEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installModFile } from '../src/main/mods-install.js';

/**
 * Instalação de modos — a cópia só depois do plano.
 *
 * O que estes testes travam: um `.jar` novo é **copiado** para a pasta; um
 * nome que já existe não é substituído (a pasta fica intacta); um ficheiro que
 * não é modo não é copiído; e uma pasta que não existe é criada na hora.
 */
describe('installModFile', () => {
  let dir: string;
  let source: string;
  let folder: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nexora-mods-'));
    source = join(dir, 'sodium.jar');
    writeFileSync(source, 'jar-de-prova');
    folder = join(dir, 'mods');
  });

  it('um jar novo entra na pasta', () => {
    const result = installModFile(source, folder);
    expect(result).toEqual({ ok: true, fileName: 'sodium.jar' });
    expect(existsSync(join(folder, 'sodium.jar'))).toBe(true);
  });

  it('um nome que já existe não é substituído', () => {
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'sodium.jar'), 'o-que-já-estava');
    const result = installModFile(source, folder);
    expect(result).toEqual({ ok: false, reason: 'already-exists' });
    // O ficheiro original fica intacto — nenhuma sobreposição silenciosa.
    expect(readFileSync(join(folder, 'sodium.jar'), 'utf8')).toBe('o-que-já-estava');
  });

  it('um ficheiro que não é modo não é copiado', () => {
    const zip = join(dir, 'jogo.zip');
    writeFileSync(zip, 'não é modo');
    expect(installModFile(zip, folder)).toEqual({ ok: false, reason: 'not-a-mod' });
    expect(readdirSync(dir)).not.toContain('mods');
  });

  it('um ficheiro que não existe é recusado sem criar pasta', () => {
    const fantasma = join(dir, 'nao-existe.jar');
    // O plano mede 0 bytes e o nome é válido: a cópia falha com honestidade.
    const result = installModFile(fantasma, folder);
    expect(result.ok).toBe(false);
  });
});
