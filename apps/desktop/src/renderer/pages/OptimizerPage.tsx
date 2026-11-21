import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, PlannedBadge, useInterface } from '@nexora/ui';
import type { OptimizerRunView, OptimizerTargetScanView } from '../../shared/preload-api.js';

/**
 * Otimizador — limpa o que o sistema regenera, e diz o que não faz.
 *
 * A página tem três partes, e a terceira é a mais importante: o que este
 * otimizador **recusa** (governor, swappiness, desactivar serviços, limpar
 * RAM), com o motivo. Um otimizador que finge fazer tudo parte o sistema de
 * alguém; este faz o que é seguro e declara o resto.
 */

/** Os alvos do catálogo, na ordem em que a página os mostra. */
const TARGETS = [
  { id: 'thumbnails', labelKey: 'optimizer.target.thumbnails', hintKey: 'optimizer.hint.thumbnails', caution: false },
  { id: 'trash', labelKey: 'optimizer.target.trash', hintKey: 'optimizer.hint.trash', caution: true },
  { id: 'fontconfig', labelKey: 'optimizer.target.fontconfig', hintKey: 'optimizer.hint.fontconfig', caution: false },
  { id: 'mesa-shader-cache', labelKey: 'optimizer.target.mesaShaderCache', hintKey: 'optimizer.hint.mesaShaderCache', caution: true },
  { id: 'steam-shader-cache', labelKey: 'optimizer.target.steamShaderCache', hintKey: 'optimizer.hint.steamShaderCache', caution: true },
] as const;

/** O que este otimizador recusa, com o motivo. */
const DECLINED = [
  { id: 'cpu-governor', labelKey: 'optimizer.declined.cpuGovernor', reasonKey: 'optimizer.reason.needsRoot' },
  { id: 'swappiness', labelKey: 'optimizer.declined.swappiness', reasonKey: 'optimizer.reason.needsRoot' },
  { id: 'services', labelKey: 'optimizer.declined.services', reasonKey: 'optimizer.reason.canBreak' },
  { id: 'ram-cleaner', labelKey: 'optimizer.declined.ramCleaner', reasonKey: 'optimizer.reason.snakeOil' },
] as const;

export function OptimizerPage(): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [scans, setScans] = useState<readonly OptimizerTargetScanView[] | null>(null);
  const [runs, setRuns] = useState<readonly OptimizerRunView[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [gameMode, setGameMode] = useState<{ available: boolean; path: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const megabytes = (bytes: number): string =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024));

  const scan = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    setBusy(true);
    const [result, history, mode] = await Promise.all([
      api.optimizer.scan(TARGETS.map((target) => target.id)),
      api.optimizer.history(),
      api.optimizer.gameMode(),
    ]);
    if (result.ok) {
      setScans(result.items ?? []);
    }
    if (history.ok) {
      setRuns(history.runs ?? []);
    }
    setGameMode(mode);
    setBusy(false);
  }, [api]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const clean = useCallback(
    async (ids: readonly string[]) => {
      if (api === undefined) {
        return;
      }
      setBusy(true);
      const result = await api.optimizer.clean(ids);
      setMessage(
        result.ok
          ? t('optimizer.cleaned', { megabytes: megabytes(result.freedBytes ?? 0) })
          : (result.message ?? t('error.generic')),
      );
      await scan();
      setBusy(false);
    },
    [api, scan, t, locale],
  );

  const restore = useCallback(
    async (runId: string) => {
      if (api === undefined) {
        return;
      }
      const result = await api.optimizer.restore(runId);
      setMessage(result.ok ? t('optimizer.restored') : (result.message ?? t('error.generic')));
      await scan();
    },
    [api, scan, t],
  );

  const byTarget = new Map((scans ?? []).map((scan) => [scan.targetId, scan]));
  const total = (scans ?? []).reduce((sum, scan) => sum + scan.totalBytes, 0);

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('optimizer.title')}</h1>
          <p className="nx-subtitle">{t('optimizer.subtitle')}</p>
        </div>
        <Button onClick={() => void scan()} disabled={busy}>
          {t('optimizer.rescan')}
        </Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <Card>
        <div className="nx-stack">
          <strong>{t('optimizer.junk.title')}</strong>
          <span className="nx-subtitle">
            {t('optimizer.junk.total', { megabytes: megabytes(total) })}
          </span>
          {TARGETS.map((target) => {
            const scan = byTarget.get(target.id);
            return (
              <div key={target.id} className="hub-row hub-row--between">
                <div className="nx-stack">
                  <span className="hub-break">{t(target.labelKey)}</span>
                  <span className="nx-subtitle">
                    {t(target.hintKey)}
                    {target.caution ? ` · ${t('optimizer.caution')}` : ''}
                  </span>
                </div>
                <div className="hub-row">
                  <Badge>{megabytes(scan?.totalBytes ?? 0)} MB</Badge>
                  <Button
                    onClick={() => void clean([target.id])}
                    disabled={busy || (scan?.totalBytes ?? 0) === 0}
                  >
                    {t('optimizer.clean')}
                  </Button>
                </div>
              </div>
            );
          })}
          <div className="hub-row">
            <Button
              variant="primary"
              onClick={() => void clean(TARGETS.map((target) => target.id))}
              disabled={busy || total === 0}
            >
              {t('optimizer.cleanAll')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('optimizer.tweaks.title')}</strong>
          <div className="hub-row hub-row--between">
            <div className="nx-stack">
              <span className="hub-break">{t('optimizer.tweak.gamemode')}</span>
              <span className="nx-subtitle">{t('optimizer.hint.gamemode')}</span>
            </div>
            {gameMode === null ? null : gameMode.available ? (
              <Badge tone="positive">{t('optimizer.tweak.active')}</Badge>
            ) : (
              <PlannedBadge label={t('optimizer.tweak.missing')} />
            )}
          </div>
          {gameMode?.available === true ? (
            <span className="nx-subtitle">{gameMode.path}</span>
          ) : null}
          <span className="nx-subtitle">{t('optimizer.tweaks.hint')}</span>
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('optimizer.declined.title')}</strong>
          {DECLINED.map((item) => (
            <div key={item.id} className="hub-row hub-row--between">
              <span className="hub-break">{t(item.labelKey)}</span>
              <span className="nx-subtitle">{t(item.reasonKey)}</span>
            </div>
          ))}
        </div>
      </Card>

      {runs.length === 0 ? null : (
        <Card>
          <div className="nx-stack">
            <strong>{t('optimizer.history.title')}</strong>
            {runs.map((run) => (
              <div key={run.id} className="hub-row hub-row--between">
                <div className="nx-stack">
                  <span className="hub-break">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(run.at))}
                  </span>
                  <span className="nx-subtitle">
                    {t('optimizer.history.run', {
                      megabytes: megabytes(run.freedBytes),
                      files: new Intl.NumberFormat(locale).format(run.removed),
                    })}
                    {run.failures > 0 ? ` · ${t('optimizer.history.failures', { count: run.failures })}` : ''}
                  </span>
                </div>
                {run.restored ? (
                  <Badge>{t('optimizer.restoredPoint')}</Badge>
                ) : (
                  <Button onClick={() => void restore(run.id)}>{t('optimizer.restore')}</Button>
                )}
              </div>
            ))}
            <span className="nx-subtitle">{t('optimizer.restore.hint')}</span>
          </div>
        </Card>
      )}
    </div>
  );
}