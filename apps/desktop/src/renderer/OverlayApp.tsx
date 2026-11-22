import { useEffect, useState, type ReactNode } from 'react';
import type { OverlayData } from '../shared/preload-api.js';
import { InterfaceProvider, useInterface } from '@nexora/ui';


/**
 * O overlay — medidas reais por cima do jogo.
 *
 * **O que está aqui é medido**: CPU, memória e temperatura vêm do `/proc` e
 * do `/sys`, e o tempo da sessão é o tempo da sessão. **O que não está**: o
 * FPS — medir FPS exige injecção no processo do jogo, e a interface diz
 * "Planejado" em vez de mostrar um número inventado. Amigos e chat ficam na
 * janela do launcher (exigem a sessão, que vive no renderer).
 */

/** O canal de ponte (o overlay não abre nem fecha o jogo). */
function readData(): OverlayData | null {
  const api = globalThis.window?.nexora;
  if (api === undefined) {
    return null;
  }
  // O preload expõe a leitura do último dado empurrado.
  const reader = (api as unknown as { overlay?: { last?: () => OverlayData | null } }).overlay;
  return reader?.last?.() ?? null;
}

/** Assina os dados empurrados pelo processo principal. */
function subscribe(listener: (data: OverlayData) => void): () => void {
  const api = globalThis.window?.nexora as unknown as {
    overlay?: { onData?: (fn: (data: OverlayData) => void) => () => void };
  } | undefined;
  if (api?.overlay?.onData === undefined) {
    return () => {
      // sem ponte: nada a desassinar
    };
  }
  return api.overlay.onData(listener);
}

export function OverlayApp(): ReactNode {
  return (
    <InterfaceProvider initialLocale="pt-BR">
      <OverlayPanel />
    </InterfaceProvider>
  );
}

/** O painel com as medidas. */
function OverlayPanel(): ReactNode {
  const { t, locale } = useInterface();
  const [data, setData] = useState<OverlayData | null>(null);

  useEffect(() => {
    const initial = readData();
    if (initial !== null) {
      setData(initial);
    }
    return subscribe(setData);
  }, []);

  const percent = (value: number | null | undefined): string =>
    value === null || value === undefined ? '—' : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value)} %`;
  const minutes = data?.elapsedSeconds ?? null;

  return (
    <div className="nx-overlay nx-stack">
      <div className="hub-row hub-row--between">
        <strong>{t('overlay.title')}</strong>
        <span className="nx-subtitle">{t('overlay.hint')}</span>
      </div>

      <div className="hub-settings-grid">
        <div className="nx-stack">
          <span className="nx-subtitle">{t('perf.cpu')}</span>
          <span className="hub-hero__title">{percent(data?.cpuPercent)}</span>
        </div>
        <div className="nx-stack">
          <span className="nx-subtitle">{t('perf.memory')}</span>
          <span className="hub-hero__title">{percent(data?.memoryPercent)}</span>
        </div>
        <div className="nx-stack">
          <span className="nx-subtitle">{t('perf.temperature')}</span>
          <span className="hub-hero__title">
            {data?.temperatureCelsius === null || data?.temperatureCelsius === undefined
              ? t('perf.unknown')
              : `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(data.temperatureCelsius)} °C`}
          </span>
          <span className="nx-subtitle">{data?.temperatureChip ?? t('perf.noSensors')}</span>
        </div>
        <div className="nx-stack">
          <span className="nx-subtitle">{t('overlay.session')}</span>
          <span className="hub-hero__title">{data?.gameTitle ?? t('overlay.noGame')}</span>
          <span className="nx-subtitle">
            {minutes === null ? '' : `${Math.floor(minutes / 60)} min`}
          </span>
        </div>
      </div>

      <div className="hub-row hub-row--between">
        <span className="nx-subtitle">{t('perf.fps')}</span>
        <span className="nx-subtitle">{t('overlay.fps.planned')}</span>
      </div>
      <span className="nx-subtitle">{t('overlay.socialHint')}</span>
    </div>
  );
}

/** Canal de dados (reexportado para os testes). */
