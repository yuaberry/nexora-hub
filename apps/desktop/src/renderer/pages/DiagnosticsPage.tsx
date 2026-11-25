import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import type { DiagnosticCheckView, DiagnosticReportView } from '../../shared/preload-api.js';

/**
 * Diagnóstico — o que o sistema está realmente a dizer.
 *
 * Quatro leituras reais (disco, carga, memória, temperaturas) com os limiares
 * do núcleo. Uma leitura que não existe mostra-se como **sem leitura** — não
 * há número inventado nem aviso genérico. O estado geral é o pior dos quatro,
 * porque um diagnóstico que esconde um crítico atrás de "ok" não é diagnóstico.
 */

/** Como cada estado se veste (o tom do selo). */
const TONE = {
  ok: 'positive',
  warning: 'planned',
  critical: 'danger',
  unknown: 'neutral',
} as const;

export function DiagnosticsPage(): ReactNode {
  const { t, locale } = useInterface();
  const [report, setReport] = useState<DiagnosticReportView | null>(null);
  const [battery, setBattery] = useState<{
    percent: number;
    status: string;
    charging: boolean;
    level: 'ok' | 'low' | 'critical';
  } | null | undefined>(undefined);

  // A bateria: `undefined` enquanto não se lê, `null` quando não há (um
  // desktop não tem bateria — e a interface não finge uma).
  useEffect(() => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    void api.diagnostics.battery().then(setBattery).catch(() => setBattery(null));
  }, []);

  const reload = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    setReport(await api.diagnostics.report());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const label = (check: DiagnosticCheckView): string => {
    switch (check.id) {
      case 'disk':
        return t('diagnostics.disk');
      case 'load':
        return t('diagnostics.load');
      case 'memory':
        return t('diagnostics.memory');
      case 'temperature':
        return t('diagnostics.temperature');
    }
  };

  const value = (check: DiagnosticCheckView): string => {
    switch (check.id) {
      case 'disk':
        if (check.freeBytes === null || check.totalBytes === null) {
          return t('diagnostics.noReading');
        }
        return `${formatBytes(check.freeBytes, locale)} / ${formatBytes(check.totalBytes, locale)}`;
      case 'load':
        return check.loadPerCore === null
          ? t('diagnostics.noReading')
          : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(check.loadPerCore)} ${t('diagnostics.perCore')}`;
      case 'memory':
        return check.memoryPercent === null
          ? t('diagnostics.noReading')
          : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(check.memoryPercent)} %`;
      case 'temperature':
        return check.hottestCelsius === null
          ? t('diagnostics.noReading')
          : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(check.hottestCelsius)} ºC`;
    }
  };

  const advice = (check: DiagnosticCheckView): string => {
    if (check.status === 'unknown') {
      return '';
    }
    if (check.status === 'ok') {
      return t(`diagnostics.ok.${check.id}`);
    }
    return t(`diagnostics.advice.${check.id}`);
  };

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <h1 className="nx-title">{t('diagnostics.title')}</h1>
        <Button onClick={() => void reload()}>{t('diagnostics.reread')}</Button>
      </div>

      {battery === undefined ? null : battery === null ? null : (
        <Card>
          <div className="nx-stack">
            <div className="hub-row hub-row--between">
              <strong>{t('battery.title')}</strong>
              <span className="hub-row">
                <Badge tone={battery.level === 'ok' ? 'positive' : battery.level === 'low' ? 'planned' : 'danger'}>
                  {new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(battery.percent)} %
                </Badge>
                <Badge tone="neutral">
                  {t(battery.charging
                    ? 'battery.charging'
                    : battery.status.toLowerCase() === 'full'
                      ? 'battery.full'
                      : 'battery.discharging')}
                </Badge>
              </span>
            </div>
            <span className="hub-progress" style={{ width: `${battery.percent}%` }} />
          </div>
        </Card>
      )}

      {report === null ? (
        <p className="nx-subtitle">{t('common.loading')}</p>
      ) : (
        <>
          <div className="hub-row">
            <Badge tone={TONE[report.overall]}>{t(`diagnostics.overall.${report.overall}`)}</Badge>
            <span className="nx-subtitle">
              {t('diagnostics.readAt')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(report.at))}
            </span>
          </div>

          <div className="hub-settings-grid">
            {report.checks.map((check) => (
              <Card key={check.id}>
                <div className="nx-stack">
                  <div className="hub-row hub-row--between">
                    <strong>{label(check)}</strong>
                    <Badge tone={TONE[check.status]}>{t(`diagnostics.state.${check.status}`)}</Badge>
                  </div>
                  <span className="hub-hero__title">{value(check)}</span>
                  {advice(check) === '' ? null : <span className="nx-subtitle">{advice(check)}</span>}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Bytes em formato legível. */
function formatBytes(bytes: number, locale: 'pt-BR' | 'en'): string {
  const units = ['B', 'kB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unit]}`;
}
