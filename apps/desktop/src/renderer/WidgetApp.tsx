import { useEffect, useState, type ReactNode } from 'react';
import { InterfaceProvider, useDocumentPreferences, useInterface } from '@nexora/ui';
import type { WidgetData } from '../shared/preload-api.js';

/**
 * Widget de sessão — o HUD sobre o jogo.
 *
 * Uma faixa pequena, sempre ao topo, com o jogo em curso, o relógio da
 * sessão e o botão de parar. Sem sessão, diz isso — nunca um mostrador a
 * zero a fingir um jogo.
 */
export function WidgetApp(): ReactNode {
  return (
    <InterfaceProvider initialLocale="pt-BR">
      <ThemeApplied />
      <WidgetHud />
    </InterfaceProvider>
  );
}

/** Aplica o tema ao documento (sem ele, as cores não existem). */
function ThemeApplied(): ReactNode {
  useDocumentPreferences();
  return null;
}

/** O HUD em si (dentro do provider, para ter os tokens do tema). */
function WidgetHud(): ReactNode {
  const { t } = useInterface();
  const [data, setData] = useState<WidgetData>({ gameTitle: null, clock: null });

  useEffect(() => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    // O processo principal empurra os dados a cada segundo.
    return api.widget.onData((next) => {
      setData(next);
    });
  }, []);

  if (data.gameTitle === null || data.clock === null) {
    return (
      <div className="nx-widget nx-widget--idle">
        <span className="nx-widget__idle">{t('widget.idle')}</span>
      </div>
    );
  }

  return (
    <div className="nx-widget">
      <div className="nx-widget__row">
        <span className="nx-widget__title" title={data.gameTitle}>
          {data.gameTitle}
        </span>
        <span className="nx-widget__clock">{data.clock}</span>
      </div>
      <div className="nx-widget__row">
        <span className="nx-widget__hint">{t('widget.elapsed')}</span>
        <button
          type="button"
          className="nx-widget__stop"
          onClick={() => {
            void globalThis.window?.nexora?.widget.stop();
          }}
        >
          {t('widget.stop')}
        </button>
      </div>
    </div>
  );
}
