import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import type { BenchmarkRunView } from '../../shared/preload-api.js';

/**
 * Benchmark — o que a máquina faz de verdade.
 *
 * As cargas correm em processos filhos e o tempo é medido com o relógio
 * monótono: a pontuação é **medida** ou não existe. Sem nenhuma corrida, a
 * página diz "ainda não medido" em vez de mostrar um número estimado — e o
 * histórico permite comparar antes e depois de uma optimização.
 */

export function BenchmarkPage(): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [runs, setRuns] = useState<readonly BenchmarkRunView[]>([]);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const history = await api.benchmark.history();
    if (history.ok) {
      setRuns(history.runs);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    setRunning(true);
    setMessage(t('benchmark.running'));
    const result = await api.benchmark.run();
    setRunning(false);
    if (result.ok && result.run !== undefined) {
      setMessage(null);
      await load();
      return;
    }
    setMessage(t('error.generic'));
  }, [api, load, t]);

  const last = runs[runs.length - 1] ?? null;
  const previous = runs[runs.length - 2] ?? null;
  const delta = percentChange(previous?.overall ?? null, last?.overall ?? null);

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('benchmark.title')}</h1>
          <p className="nx-subtitle">{t('benchmark.subtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => void run()} disabled={running}>
          {running ? t('benchmark.running') : t('benchmark.run')}
        </Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      {last === null ? (
        <EmptyState title={t('benchmark.estimated')} hint={t('benchmark.estimatedHint')} />
      ) : (
        <>
          <div className="hub-settings-grid">
            <Card>
              <div className="nx-stack">
                <strong>{t('benchmark.overall')}</strong>
                <span className="hub-hero__title">
                  {last.overall === null
                    ? t('benchmark.failed')
                    : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(last.overall)}
                </span>
                <span className="nx-subtitle">
                  {delta === null
                    ? t('benchmark.delta.same')
                    : t('benchmark.delta', {
                        percent: `${delta > 0 ? '+' : ''}${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(delta)} %`,
                      })}
                </span>
                <Badge tone="positive">{t('benchmark.measured')}</Badge>
                <span className="nx-subtitle">{t('benchmark.reference', { version: '1' })}</span>
              </div>
            </Card>
          </div>

          <Card>
            <div className="nx-stack">
              <strong>{t('benchmark.history')}</strong>
              {last.results.map((result) => (
                <div key={result.workloadId} className="hub-row hub-row--between">
                  <div className="nx-stack">
                    <span className="hub-break">{t(workloadLabel(result.workloadId))}</span>
                    <span className="nx-subtitle">{t(workloadHint(result.workloadId))}</span>
                  </div>
                  <div className="hub-row">
                    {result.measured ? (
                      <>
                        <Badge tone="positive">
                          {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(result.score)}
                        </Badge>
                        <span className="nx-subtitle">
                          {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(result.elapsedMs)} ms
                        </span>
                      </>
                    ) : (
                      <PlannedBadge label={t('benchmark.failed')} />
                    )}
                  </div>
                </div>
              ))}
              <span className="nx-subtitle">{t('benchmark.hint')}</span>
            </div>
          </Card>

          {runs.length > 1 ? (
            <Card>
              <div className="nx-stack">
                <strong>{t('benchmark.history')}</strong>
                {[...runs].reverse().slice(0, 6).map((entry) => (
                  <div key={entry.at} className="hub-row hub-row--between">
                    <span className="nx-subtitle">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.at))}
                    </span>
                    <Badge>
                      {entry.overall === null
                        ? t('benchmark.failed')
                        : new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(entry.overall)}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}

/** Chave do nome de uma carga (explícita, nunca dinâmica). */
function workloadLabel(id: string): 'benchmark.cpuSort' | 'benchmark.cpuHash' {
  return id === 'cpu-hash' ? 'benchmark.cpuHash' : 'benchmark.cpuSort';
}

/** Chave da descrição de uma carga (explícita, nunca dinâmica). */
function workloadHint(id: string): 'benchmark.hint.cpuSort' | 'benchmark.hint.cpuHash' {
  return id === 'cpu-hash' ? 'benchmark.hint.cpuHash' : 'benchmark.hint.cpuSort';
}

/** Variação percentual entre duas pontuações (`null` sem as duas). */
function percentChange(previous: number | null, current: number | null): number | null {
  if (previous === null || current === null || previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 1000) / 10;
}