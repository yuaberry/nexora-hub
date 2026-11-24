import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import type { DesktopGameView } from '../../shared/preload-api.js';
import { GameImage } from './GameImage.js';
import { coverFit, coverUrl } from '../lib/media.js';

/**
 * Capa do jogo — a personalização do utilizador.
 *
 * A capa automática é a imagem que a **Steam** guardou para o jogo (o logo,
 * quando existe) — lida do disco, e por isso disponível offline. O utilizador
 * pode escolher outra entre as que a Steam guardou, ou um ficheiro seu.
 *
 * Uma regra: a sincronização com a Steam **nunca** mexe numa capa escolhida
 * pelo utilizador — a escolha dele vale mais que a nossa.
 */

export function CoverSection({
  game,
  onChanged,
}: {
  readonly game: DesktopGameView;
  /** Chamado depois de a capa mudar (para a grelha reflextir a troca). */
  readonly onChanged: () => void;
}): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [options, setOptions] = useState<readonly { readonly path: string; readonly label: string }[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.steam.coverOptions(game.id);
    setOptions(result.ok ? result.options ?? [] : []);
  }, [api, game.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setCover = useCallback(
    async (path: string) => {
      if (api === undefined) {
        return;
      }
      const result = await api.covers.set(game.id, path);
      setMessage(result.ok ? null : (result.message ?? t('covers.setFailed')));
      if (result.ok) {
        onChanged();
      }
    },
    [api, game.id, onChanged, t],
  );

  const onPick = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const picked = await api.covers.pick();
    if (!picked.ok || picked.path === undefined) {
      setMessage(t('covers.pickFailed'));
      return;
    }
    await setCover(picked.path);
  }, [api, setCover, t]);

  const onReset = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.covers.reset(game.id);
    setMessage(result.ok ? t('covers.restored') : (result.message ?? t('covers.setFailed')));
    if (result.ok) {
      onChanged();
    }
  }, [api, game.id, onChanged, t]);

  const chosen = game.cover;
  const alternatives = (options ?? []).filter((option) => option.path !== chosen);

  return (
    <Card>
      <div className="nx-stack">
        <strong>{t('covers.title')}</strong>

        <div className="hub-row" style={{ alignItems: 'flex-start', gap: '1rem' }}>
          <div className="nx-cover" style={{ width: '9rem', height: '12rem', flex: '0 0 auto' }}>
            <GameImage
              src={coverUrl(chosen)}
              fit={coverFit(chosen)}
              alt=""
              fallback={<span aria-hidden="true">{game.title.slice(0, 1).toUpperCase()}</span>}
            />
          </div>
          <div className="nx-stack" style={{ flex: 1 }}>
            <span className="nx-subtitle">
              {chosen === null ? t('covers.automatic') : chosen.split('/').pop()}
            </span>
            <div className="hub-row">
              <Button onClick={() => void onPick()}>{t('covers.choose')}</Button>
              <Button onClick={() => void onReset()}>{t('covers.reset')}</Button>
            </div>
            <span className="nx-subtitle">{t('covers.hint')}</span>
          </div>
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        <div className="hub-row hub-row--between">
          <strong>{t('covers.steamImages')}</strong>
          {alternatives.length > 1 ? (
            <span className="nx-subtitle">{t('covers.galleryHint')}</span>
          ) : null}
        </div>
        {options === null ? null : alternatives.length === 0 ? (
          <p className="nx-subtitle">{t('covers.noSteamImages')}</p>
        ) : (
          <div className="hub-gallery">
            {alternatives.map((option) => (
              <button
                key={option.path}
                type="button"
                className="hub-gallery__item"
                title={option.label}
                onClick={() => {
                  void setCover(option.path);
                }}
              >
                <GameImage
                  src={coverUrl(option.path)}
                  fit={coverFit(option.path)}
                  alt={option.label}
                  fallback={<span className="nx-subtitle">{option.label}</span>}
                />
              </button>
            ))}
          </div>
        )}

        <div className="hub-row">
          <Badge>{t('covers.automatic')}</Badge>
          <Badge tone="positive">{new Intl.NumberFormat(locale).format((options ?? []).length)}</Badge>
        </div>
      </div>
    </Card>
  );
}