/**
 * Otimizador — limpeza do que o sistema regenera, com ponto de restauro.
 *
 * Três regras que este módulo segue:
 *
 * 1. **Só apaga o que o sistema regenera**: cache de miniaturas, cache de
 *    shaders, lixo. O que tem custo (recompilar shaders) é dito antes.
 * 2. **Só apaga dentro da pasta do utilizador** — nunca do sistema, nunca
 *    com privilégios. O que exige root (governor, swappiness) é recusado.
 * 3. **Toda a execução fica registada** num manifesto: o que saiu, quanto
 *    espaço, e o ponto de restauro (que recria a estrutura de pastas — os
 *    ficheiros de cache não voltam, e o utilizador é informado disso).
 */

import { existsSync, readdirSync, rmSync, statSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { summarizeScan, summarizeRun, type Finding, type CleanFailure } from '@nexora/core';

/** Nome do ficheiro de manifesto (na pasta de dados da app). */
const MANIFEST_NAME = 'optimizer-history.json';

/** Uma execução registada. */
export interface OptimizerRun {
  readonly id: string;
  /** ISO-8601 UTC da execução. */
  readonly at: string;
  /** Bytes libertados. */
  readonly freedBytes: number;
  /** Ficheiros apagados. */
  readonly removed: readonly string[];
  /** Falhas, com o motivo. */
  readonly failures: readonly { path: string; reason: string }[];
  /** `true` quando o ponto de restauro foi aplicado. */
  restored: boolean;
}

/** O que uma varredura encontrou num alvo. */
export interface TargetScan {
  readonly targetId: string;
  readonly findings: readonly Finding[];
  readonly totalBytes: number;
  readonly fileCount: number;
}

/** Caminhos de um alvo dentro da pasta do utilizador. */
function targetPaths(home: string): ReadonlyMap<string, string> {
  return new Map([
    ['thumbnails', join(home, '.cache', 'thumbnails')],
    ['trash', join(home, '.local', 'share', 'Trash')],
    ['fontconfig', join(home, '.cache', 'fontconfig')],
    ['mesa-shader-cache', join(home, '.cache', 'mesa_shader_cache')],
    ['steam-shader-cache', join(home, '.local', 'share', 'Steam', 'steamapps', 'shadercache')],
  ]);
}

/** O Steam noutros sítios (a pasta do utilizador varia com a instalação). */
function steamShaderCacheCandidates(home: string): readonly string[] {
  return [
    join(home, '.local', 'share', 'Steam', 'steamapps', 'shadercache'),
    join(home, '.steam', 'steam', 'steamapps', 'shadercache'),
  ];
}

/**
 * Varre um alvo e devolve o que encontrou.
 *
 * A profundidade é limitada de propósito: um cache com milhões de ficheiros
 * pequenos nunca pode pendurar a varredura.
 */
export function scanTarget(
  targetId: string,
  home: string = homedir(),
  maxEntries = 20_000,
): TargetScan {
  const paths = targetPaths(home);
  const roots = targetId === 'steam-shader-cache' ? steamShaderCacheCandidates(home) : [paths.get(targetId) ?? ''];
  const findings: Finding[] = [];
  let visited = 0;

  for (const root of roots) {
    if (root === '' || !existsSync(root)) {
      continue;
    }
    const walk = (dir: string): void => {
      if (visited >= maxEntries) {
        return;
      }
      let entries;
      try {
        entries = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (visited >= maxEntries) {
          return;
        }
        visited += 1;
        const full = join(dir, entry.name);
        try {
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (entry.isFile()) {
            findings.push({ targetId, path: full, bytes: statSync(full).size });
          }
        } catch {
          // entrada ilegível é ignorada — a varredura continua
        }
      }
    };
    walk(root);
  }

  const summary = summarizeScan(findings);
  return { targetId, findings, totalBytes: summary.totalBytes, fileCount: summary.fileCount };
}

/**
 * Limpa os ficheiros encontrados por uma varredura.
 *
 * Só apaga **ficheiros** — uma pasta vazia fica (o sistema espera
 * encontrá-la). O que não pode ser apagado volta como falha, com o motivo,
 * e não some em silêncio.
 */
export function applyClean(targets: readonly TargetScan[]): {
  freedBytes: number;
  removed: readonly Finding[];
  failures: readonly CleanFailure[];
} {
  const removed: Finding[] = [];
  const failures: CleanFailure[] = [];
  for (const target of targets) {
    for (const finding of target.findings) {
      try {
        rmSync(finding.path, { force: true });
        removed.push(finding);
      } catch (cause) {
        failures.push({ path: finding.path, reason: cause instanceof Error ? cause.message : 'erro desconhecido' });
      }
    }
  }
  const run = summarizeRun(removed, failures);
  return { freedBytes: run.freedBytes, removed, failures };
}

/**
 * Procura um executável nos sítios conhecidos.
 *
 * Devolve o caminho ou `null` — a ferramenta não finge ter o GameMode
 * installed quando não está.
 */
export function findExecutable(name: string, extraPaths: readonly string[] = []): string | null {
  const candidates = [
    ...extraPaths,
    ...(process.env['PATH'] ?? '').split(':').filter((dir) => dir !== '').map((dir) => join(dir, name)),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Caminho do GameMode (`null` quando não está instalado). */
export function findGameMode(): string | null {
  return findExecutable('gamemoderun', ['/usr/games/gamemoderun', '/usr/bin/gamemoderun']);
}

/** Lê o histórico de execuções (vazio quando não há). */
export function readHistory(dataDir: string): readonly OptimizerRun[] {
  const path = join(dataDir, MANIFEST_NAME);
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return (parsed as OptimizerRun[]).map((run) => ({ ...run, restored: run.restored === true }));
  } catch {
    return [];
  }
}

/** Escreve o histórico (a pasta de dados é criada se faltar). */
export function writeHistory(dataDir: string, runs: readonly OptimizerRun[]): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, MANIFEST_NAME), JSON.stringify(runs, null, 2), 'utf8');
}

/**
 * Aplica o ponto de restauro de uma execução: recria a estrutura de pastas.
 *
 * **Os ficheiros de cache não voltam** — são regenerados pelo sistema, e é
 * isso que a interface diz. O que o ponto garante é a estrutura: uma pasta
 * que o jogo espera encontrar não fica em falta.
 */
export function restoreRun(dataDir: string, runId: string): OptimizerRun | null {
  const runs = [...readHistory(dataDir)];
  const run = runs.find((entry) => entry.id === runId);
  if (run === undefined || run.restored) {
    return null;
  }
  for (const path of run.removed) {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch {
      // pasta que não pode ser recriada fica de fora — o restauro é honesto
    }
  }
  const updated: OptimizerRun = { ...run, restored: true };
  writeHistory(
    dataDir,
    runs.map((entry) => (entry.id === runId ? updated : entry)),
  );
  return updated;
}

