import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Card, PlannedBadge, useInterface } from '@nexora/ui';
import type { TelemetrySampleView } from '../../shared/preload-api.js';

/**
 * Desempenho — as leituras reais do sistema.
 *
 * CPU, memória e temperaturas vêm do `/proc` e do `/sys`: medidas, não
 * estimativas. O FPS **não** aparece com número — medir FPS dentro do jogo
 * exige injecção no processo do jogo, e isso é fase futura: o selo diz o
 * que falta em vez de mostrar um número inventado.
 */

/** Intervalo entre amostras (a CPU mede-se por diferença). */
const SAMPLE_MS = 2_000;

export function PerformanceCard({ label }: { readonly label?: string }): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;
  const [sample, setSample] = useState<TelemetrySampleView | null>(null);

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    setSample(await api.telemetry.sample());
  }, [api]);

  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, SAMPLE_MS);
    return () => {
      clearInterval(timer);
    };
  }, [reload]);

  const hottest = sample?.temperatures[0] ?? null;
  const percent = (value: number | null | undefined): string =>
    value === null || value === undefined ? t('perf.unknown') : `${format(value, locale)} %`;

  return (
    <Card>
      <div className="nx-stack">
        <strong>{label ?? t('perf.title')}</strong>
        <div className="hub-settings-grid">
          <div className="nx-stack">
            <span className="nx-subtitle">{t('perf.cpu')}</span>
            <span className="hub-hero__title">{percent(sample?.cpuPercent)}</span>
          </div>
          <div className="nx-stack">
            <span className="nx-subtitle">{t('perf.memory')}</span>
            <span className="hub-hero__title">{percent(sample?.memoryPercent)}</span>
          </div>
          <div className="nx-stack">
            <span className="nx-subtitle">{t('perf.temperature')}</span>
            <span className="hub-hero__title">
              {hottest === null ? t('perf.unknown') : `${format(hottest.celsius, locale)} °C`}
            </span>
            <span className="nx-subtitle">
              {hottest === null ? t('perf.noSensors') : `${hottest.chip}${hottest.label === null ? '' : ` · ${hottest.label}`}`}
            </span>
          </div>
          <div className="nx-stack">
            <span className="nx-subtitle">{t('perf.load')}</span>
            <span className="hub-hero__title">
              {sample?.loadAverage === null || sample?.loadAverage === undefined
                ? t('perf.unknown')
                : format(sample.loadAverage, locale)}
            </span>
          </div>
        </div>
        <div className="hub-row hub-row--between">
          <span className="nx-subtitle">{t('perf.fps')}</span>
          <PlannedBadge label={t('planned.badge')} />
        </div>
        <span className="nx-subtitle">{t('perf.fps.planned')}</span>
        <span className="nx-subtitle">{t('perf.hint')}</span>
      </div>
    </Card>
  );
}

/** Número formatado no idioma (uma casa decimal quando faz sentido). */
function format(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}