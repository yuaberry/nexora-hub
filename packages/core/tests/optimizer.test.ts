import { describe, expect, it } from 'vitest';
import {
  CLEAN_TARGETS,
  DECLINED_TWEAKS,
  LAUNCH_TWEAKS,
  selectTargets,
  targetById,
} from '../src/optimizer/targets.js';
import { scanIsEmpty, summarizeRun, summarizeScan, toMegabytes, type Finding } from '../src/optimizer/report.js';

describe('catálogo de alvos', () => {
  it('declara os alvos com o que acontece ao limpar', () => {
    expect(CLEAN_TARGETS.map((target) => target.id)).toEqual([
      'thumbnails',
      'trash',
      'fontconfig',
      'mesa-shader-cache',
      'steam-shader-cache',
    ]);
    // O que tem custo real marca a cautela — quem escolhe, escolhe informado.
    expect(CLEAN_TARGETS.find((t) => t.id === 'mesa-shader-cache')?.caution).toBe(true);
    expect(CLEAN_TARGETS.find((t) => t.id === 'thumbnails')?.caution).toBe(false);
  });

  it('encontra um alvo pelo identificador', () => {
    expect(targetById('trash')?.labelKey).toBe('optimizer.target.trash');
    expect(targetById('nao-existe')).toBeUndefined();
  });

  it('um identificador desconhecido é ignorado, não adivinhado', () => {
    const alvos = selectTargets(['thumbnails', 'apagar-tudo', 'trash']);
    expect(alvos.map((t) => t.id)).toEqual(['thumbnails', 'trash']);
  });

  it('declara o que recusa, com o motivo', () => {
    // O otimizador de YouTube mexe no governor e na swappiness: aqui isso é
    // recusado com razão escrita — e o "limpa RAM" é declarado o que é.
    expect(DECLINED_TWEAKS.map((t) => t.id)).toContain('cpu-governor');
    expect(DECLINED_TWEAKS.find((t) => t.id === 'ram-cleaner')?.reasonKey).toBe('optimizer.reason.snakeOil');
    expect(LAUNCH_TWEAKS.map((t) => t.id)).toEqual(['gamemode']);
  });
});

describe('resumo da varredura', () => {
  const findings: readonly Finding[] = [
    { targetId: 'thumbnails', path: '/a/1.png', bytes: 1000 },
    { targetId: 'thumbnails', path: '/a/2.png', bytes: 2000 },
    { targetId: 'trash', path: '/b/x', bytes: 500 },
  ];

  it('soma o total, conta os ficheiros e agrupa por alvo', () => {
    const resumo = summarizeScan(findings);
    expect(resumo.totalBytes).toBe(3500);
    expect(resumo.fileCount).toBe(3);
    expect(resumo.byTarget.get('thumbnails')).toBe(3000);
    expect(resumo.byTarget.get('trash')).toBe(500);
  });

  it('uma varredura vazia é vazia (não zeros a fingir dados)', () => {
    expect(scanIsEmpty(summarizeScan([]))).toBe(true);
  });

  it('a execução soma o que foi limpo e guarda as falhas', () => {
    const execucao = summarizeRun(findings.slice(0, 2), [
      { path: '/b/x', reason: 'permissão negada' },
    ]);
    expect(execucao.freedBytes).toBe(3000);
    expect(execucao.removed).toHaveLength(2);
    expect(execucao.failures[0]?.reason).toBe('permissão negada');
  });

  it('megabytes arredondam para o que o disco viu', () => {
    expect(toMegabytes(1024 * 1024)).toBe(1);
    expect(toMegabytes(1024 * 1024 * 1.5)).toBe(1.5);
    expect(toMegabytes(-5)).toBe(0);
  });
});
