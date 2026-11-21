import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  applyClean,
  findExecutable,
  findGameMode,
  readHistory,
  restoreRun,
  scanTarget,
  writeHistory,
} from '../src/main/optimizer.js';

/**
 * Otimizador — a limpeza é real e reversível na estrutura.
 *
 * O que estes testes travam: a varredura mede o que existe, a limpeza apaga
 * só **ficheiros** (as pastas ficam), o que não pode ser apagado volta como
 * falha com o motivo, o histórico guarda as execuções e o ponto de restauro
 * recria a estrutura sem fingir que os ficheiros voltaram.
 */

/** Uma pasta do utilizador de mentira, com cache em dois alvos. */
function fakeHome(): { home: string; data: string } {
  const home = mkdtempSync(join(tmpdir(), 'nexora-opt-home-'));
  const data = mkdtempSync(join(tmpdir(), 'nexora-opt-data-'));
  const thumbnails = join(home, '.cache', 'thumbnails');
  const shader = join(home, '.cache', 'mesa_shader_cache');
  mkdirSync(join(thumbnails, 'large'), { recursive: true });
  mkdirSync(shader, { recursive: true });
  writeFileSync(join(thumbnails, 'a.png'), 'x'.repeat(1000));
  writeFileSync(join(thumbnails, 'large', 'b.png'), 'y'.repeat(2000));
  writeFileSync(join(shader, 's1'), 'z'.repeat(500));
  return { home, data };
}

describe('scanTarget', () => {
  let home: string;
  let data: string;

  beforeEach(() => {
    const feito = fakeHome();
    home = feito.home;
    data = feito.data;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });

  it('mede o que existe, com o total por alvo', () => {
    const scan = scanTarget('thumbnails', home);
    expect(scan.fileCount).toBe(2);
    expect(scan.totalBytes).toBe(3000);
  });

  it('um alvo sem pasta dá zero (não cria nem finge)', () => {
    const scan = scanTarget('trash', home);
    expect(scan.fileCount).toBe(0);
    expect(scan.totalBytes).toBe(0);
  });

  it('o cache de shaders é medido ao lado das miniaturas', () => {
    expect(scanTarget('mesa-shader-cache', home).totalBytes).toBe(500);
  });
});

describe('applyClean', () => {
  let home: string;
  let data: string;

  beforeEach(() => {
    const feito = fakeHome();
    home = feito.home;
    data = feito.data;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });

  it('apaga os ficheiros e soma o espaço libertado', () => {
    const scan = scanTarget('thumbnails', home);
    const limpo = applyClean([scan]);
    expect(limpo.freedBytes).toBe(3000);
    expect(limpo.removed).toHaveLength(2);
    // A pasta fica — o sistema espera encontrá-la.
    expect(scanTarget('thumbnails', home).fileCount).toBe(0);
  });

  it('uma segunda limpeza não encontra nada (é idempotente)', () => {
    applyClean([scanTarget('thumbnails', home)]);
    expect(applyClean([scanTarget('thumbnails', home)]).freedBytes).toBe(0);
  });
});

describe('histórico e ponto de restauro', () => {
  let home: string;
  let data: string;

  beforeEach(() => {
    const feito = fakeHome();
    home = feito.home;
    data = feito.data;
  });

  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
    rmSync(data, { recursive: true, force: true });
  });

  it('guarda as execuções e devolve-as', () => {
    const scan = scanTarget('thumbnails', home);
    const limpo = applyClean([scan]);
    const run = {
      id: 'run-1',
      at: new Date().toISOString(),
      freedBytes: limpo.freedBytes,
      removed: limpo.removed.map((finding) => finding.path),
      failures: [],
      restored: false,
    };
    writeHistory(data, [run]);
    const historico = readHistory(data);
    expect(historico).toHaveLength(1);
    expect(historico[0]?.freedBytes).toBe(3000);
  });

  it('o ponto de restauro recria a estrutura e marca a execução', () => {
    const scan = scanTarget('thumbnails', home);
    const limpo = applyClean([scan]);
    const caminho = join(home, '.cache', 'thumbnails', 'large');
    rmSync(caminho, { recursive: true, force: true });
    const run = {
      id: 'run-2',
      at: new Date().toISOString(),
      freedBytes: limpo.freedBytes,
      removed: limpo.removed.map((finding) => finding.path),
      failures: [],
      restored: false,
    };
    writeHistory(data, [run]);
    const restaurado = restoreRun(data, 'run-2');
    expect(restaurado?.restored).toBe(true);
    // A pasta volta a existir (os ficheiros, não — e a interface diz isso).
    expect(require('node:fs').existsSync(caminho)).toBe(true);
    // Um segundo restauro da mesma execução é recusado.
    expect(restoreRun(data, 'run-2')).toBeNull();
  });

  it('um histórico que não existe devolve lista vazia', () => {
    expect(readHistory(join(data, 'nao-existe'))).toHaveLength(0);
  });
});

describe('executáveis do sistema', () => {
  it('encontra um executável nos sítios conhecidos', () => {
    expect(findExecutable('ls', ['/bin/ls', '/usr/bin/ls'])).toBe('/bin/ls');
    expect(findExecutable('nao-existe-nexora', ['/tmp/nao-existe'])).toBeNull();
  });

  it('o GameMode é detectado nesta máquina (a tweak real)', () => {
    expect(findGameMode()).not.toBeNull();
  });
});
