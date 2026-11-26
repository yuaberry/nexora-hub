import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import type { DesktopGameView, DlcView } from '../../shared/preload-api.js';

/**
 * DLCs do jogo — o que a loja declara e o que está no disco.
 *
 * Duas verdades, mostradas juntas e separadas: os **nomes** das DLCs vêm da
 * loja pública da Steam (um pedido por DLC, por isso com limite), e quais
 * estão **instaladas** vem dos manifestos no disco — não há adivinhação. Um
 * jogo sem AppID não tem secção: não há o que perguntar à loja.
 */

/** Quantos nomes a loja responde por pedido (o limite declarado). */
const MAX_DLC_LOOKUPS = 25;

export function DlcSection({ game }: { readonly game: DesktopGameView }): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [items, setItems] = useState<readonly DlcView[] | null>(null);
  const [truncated, setTruncated] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onLoad = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    setLoading(true);
    const result = await api.steam.dlcs(game.id);
    setLoading(false);
    if (!result.ok) {
      // Capacidade desligada: a secção explica o interruptor em vez de fingir
      // que a loja falhou.
      setMessage(
        result.reasonKey === 'plugins.off'
          ? t('plugins.off')
          : (result.message ?? t('catalog.dlc.failed')),
      );
      setItems(null);
      return;
    }
    setItems(result.items ?? []);
    setTruncated(result.truncated ?? 0);
    setMessage(null);
  }, [api, game.id, t]);

  // Sem appid não há o que perguntar à loja: a secção não existe.
  if (game.steamAppId === null) {
    return null;
  }

  const listed = (items ?? []).slice(0, MAX_DLC_LOOKUPS);

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('catalog.dlc.title')}</strong>
          {items === null ? (
            <Button onClick={() => void onLoad()} disabled={loading}>
              {loading ? t('common.loading') : t('catalog.dlc.load')}
            </Button>
          ) : (
            <Badge>{new Intl.NumberFormat(locale).format(items.length)}</Badge>
          )}
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        {items === null ? null : items.length === 0 ? (
          <p className="nx-subtitle">{t('catalog.dlc.empty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
            {listed.map((dlc) => (
              <li key={dlc.appId} className="hub-row hub-row--between">
                <span className="hub-break">{dlc.title}</span>
                <span className="hub-row">
                  <Badge tone={dlc.free ? 'positive' : 'neutral'}>
                    {dlc.free ? t('catalog.free') : t('catalog.paid')}
                  </Badge>
                  <Badge tone={dlc.installed ? 'positive' : 'planned'}>
                    {dlc.installed ? t('catalog.dlc.installed') : t('catalog.dlc.notInstalled')}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}

        {truncated > 0 ? (
          <p className="nx-subtitle">
            {t('catalog.dlc.truncated', { count: new Intl.NumberFormat(locale).format(truncated) })}
          </p>
        ) : null}

        <p className="nx-subtitle">{t('catalog.dlc.source')}</p>
      </div>
    </Card>
  );
}