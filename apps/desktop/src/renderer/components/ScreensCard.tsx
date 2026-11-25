import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Button, Card, useInterface } from '@nexora/ui';
import { coverUrl } from '../lib/media.js';
import { accessToken } from '../lib/api.js';
import type { ScreenshotView } from '../../shared/preload-api.js';

/** Uma captura na nuvem (a da conta). */
interface CloudShot {
  readonly id: string;
  readonly gameKey: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
}

/**
 * Capturas — os momentos do jogo, guardados.
 *
 * A captura é do **ecrã inteiro**: um jogo a correr está no ecrã, e capturar
 * a janela do launcher não mostraria o jogo. As imagens são servidas pelo
 * mesmo esquema interno das capas — estão no disco do utilizador.
 */
export function ScreensCard({ gameKey }: { readonly gameKey: string }): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [shots, setShots] = useState<readonly ScreenshotView[] | null>(null);
  const [cloud, setCloud] = useState<readonly CloudShot[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    setShots(await api.screens.list(gameKey));
    const token = accessToken();
    setCloud(token === null ? [] : await api.screens.cloudList(gameKey, token));
  }, [api, gameKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCapture = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.screens.capture(gameKey);
    setMessage(result.ok ? t('screens.captured') : t('screens.failed'));
    await reload();
  }, [api, gameKey, reload, t]);

  const onRemove = useCallback(
    async (fileName: string) => {
      if (api === undefined) {
        return;
      }
      await api.screens.remove(gameKey, fileName);
      await reload();
    },
    [api, gameKey, reload],
  );

  const onUpload = useCallback(
    async (fileName: string) => {
      if (api === undefined) {
        return;
      }
      const token = accessToken();
      if (token === null) {
        setMessage(t('cloud.login'));
        return;
      }
      const result = await api.screens.upload(gameKey, fileName, token);
      setMessage(result.ok ? t('screens.uploaded') : t('screens.uploadFailed'));
      await reload();
    },
    [api, gameKey, reload, t],
  );

  const onCloudRemove = useCallback(
    async (shotId: string) => {
      if (api === undefined) {
        return;
      }
      const token = accessToken();
      if (token !== null) {
        await api.screens.cloudRemove(shotId, token);
      }
      await reload();
    },
    [api, reload],
  );

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('screens.title')}</strong>
          <Button onClick={() => void onCapture()}>{t('screens.capture')}</Button>
        </div>
        <span className="nx-subtitle">{t('screens.hint')}</span>
        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        {shots === null ? (
          <p className="nx-subtitle">{t('common.loading')}</p>
        ) : shots.length === 0 ? (
          <p className="nx-subtitle">{t('screens.empty')}</p>
        ) : (
          <div className="hub-gallery">
            {shots.map((shot) => (
              <div key={shot.fileName} className="hub-gallery__item" style={{ position: 'relative' }}>
                <img
                  src={coverUrl(shot.path) ?? undefined}
                  alt={shot.fileName}
                  loading="lazy"
                  style={{ width: '100%', height: '100%' }}
                />
                <span style={{ position: 'absolute', top: '0.25rem', left: '0.25rem', display: 'flex', gap: '0.25rem' }}>
                  <button
                    type="button"
                    className="nx-widget__stop"
                    onClick={() => {
                      void onUpload(shot.fileName);
                    }}
                  >
                    {t('screens.upload')}
                  </button>
                  <button
                    type="button"
                    className="nx-widget__stop"
                    onClick={() => {
                      void onRemove(shot.fileName);
                    }}
                  >
                    {t('screens.remove')}
                  </button>
                </span>
              </div>
            ))}
            <span className="nx-subtitle">
              {new Intl.NumberFormat(locale).format(shots.length)} ·{' '}
              {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
                shots.reduce((total, shot) => total + shot.sizeBytes, 0) / 1_000_000,
              )}{' '}
              MB
            </span>
          </div>
        )}

        <strong>{t('screens.cloud')}</strong>
        {cloud.length === 0 ? (
          <p className="nx-subtitle">{t('screens.cloudEmpty')}</p>
        ) : (
          <div className="hub-gallery">
            {cloud.map((shot) => (
              <div key={shot.id} className="hub-gallery__item" style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="nx-widget__stop"
                  style={{ position: 'absolute', top: '0.25rem', right: '0.25rem', zIndex: 1 }}
                  onClick={() => {
                    void onCloudRemove(shot.id);
                  }}
                >
                  {t('screens.remove')}
                </button>
                <span className="nx-subtitle" style={{ padding: '0.4rem' }}>{shot.fileName}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
