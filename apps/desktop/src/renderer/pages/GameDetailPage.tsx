import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { useLibrary, useRunner, ErrorNote } from '../state/desktop.js';
import { formatDate, formatPlayTime } from '../lib/format.js';
import type { SaveSnapshotView } from '../../shared/preload-api.js';

/**
 * Detalhes do jogo — a segunda pele do launcher.
 *
 * Capa grande, acções à vista, metadados em pares chave/valor, e os saves
 * por baixo. A capa é o ficheiro local; sem ficheiro, o placeholder do tema
 * (nunca uma imagem inventada). O tempo jogado é medido localmente — e a
 * interface diz que sincronizar com a conta é fase futura.
 */
export function GameDetailPage({
  gameId,
  onBack,
}: {
  readonly gameId: string;
  readonly onBack: () => void;
}): ReactNode {
  const { t, locale } = useInterface();
  const library = useLibrary();
  const runner = useRunner();
  const [message, setMessage] = useState<string | null>(null);

  const games = library.value ?? [];
  const game = games.find((entry) => entry.externalKey === gameId) ?? null;

  const onPlay = useCallback(async () => {
    if (game === null) {
      return;
    }
    const result = await runner.launch(game.id);
    setMessage(
      result.ok
        ? t('runner.session.started')
        : t(result.reasonKey === 'missing-executable' ? 'details.executable.missing' : 'runner.launch.error'),
    );
  }, [game, runner, t]);

  if (library.loading) {
    return <p>{t('common.loading')}</p>;
  }

  if (game === null) {
    return (
      <EmptyState title={t('library.search.noResults')} hint={t('library.empty.hint')}>
        <Button onClick={onBack}>{t('common.action.back')}</Button>
      </EmptyState>
    );
  }

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <Button onClick={onBack}>{t('common.action.back')}</Button>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      <div className="hub-detail">
        <div className="nx-cover hub-cover-large">
          {game.cover === null ? (
            <span aria-hidden="true">{game.title.slice(0, 1).toUpperCase()}</span>
          ) : (
            <img src={game.cover} alt="" />
          )}
        </div>

        <div className="nx-stack">
          <h1 className="nx-title" style={{ fontSize: '1.75rem' }}>
            {game.title}
          </h1>

          <dl className="hub-kv">
            <div className="hub-kv__row">
              <dt className="hub-kv__key">{t('details.playedTime')}</dt>
              <dd style={{ margin: 0 }}>{formatPlayTime(game.totalSeconds, locale, t)}</dd>
            </div>
            <div className="hub-kv__row">
              <dt className="hub-kv__key">{t('details.lastPlayed')}</dt>
              <dd style={{ margin: 0 }}>{formatDate(game.lastPlayedAt, locale, t('details.neverPlayed'))}</dd>
            </div>
            <div className="hub-kv__row">
              <dt className="hub-kv__key">{t('details.installPath')}</dt>
              <dd className="hub-break" style={{ margin: 0 }}>{game.installPath}</dd>
            </div>
            <div className="hub-kv__row">
              <dt className="hub-kv__key">{t('details.executablePath')}</dt>
              <dd className="hub-break" style={{ margin: 0 }}>{game.executablePath}</dd>
            </div>
          </dl>

          <div className="hub-row">
            <Button variant="primary" onClick={() => void onPlay()}>
              {t('common.action.play')}
            </Button>
            <Button
              aria-pressed={game.favorite}
              onClick={() => {
                void library.toggleFavorite(game.id);
              }}
            >
              {game.favorite ? t('details.favorite') : t('details.notFavorite')}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                void library.remove(game.id).then(onBack);
              }}
            >
              {t('details.remove')}
            </Button>
          </div>

          {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
          {library.error === null ? null : <ErrorNote message={library.error} retry={library.reload} />}
        </div>
      </div>

      <SavesCard gameKey={game.externalKey} savePath={game.installPath} onMessage={setMessage} />

      <Card>
        <div className="nx-stack">
          <strong>{t('community.title')}</strong>
          <span className="nx-subtitle">{t('community.planned')}</span>
          <Badge tone="planned">{t('planned.badge')}</Badge>
        </div>
      </Card>
    </div>
  );
}

/**
 * Saves do jogo — snapshots versionados.
 *
 * A pasta de saves é, nesta fase, a pasta de instalação — dita na interface,
 * não escondida: pastas configuráveis por jogo são a fase seguinte.
 */
function SavesCard({
  gameKey,
  savePath,
  onMessage,
}: {
  readonly gameKey: string;
  readonly savePath: string;
  readonly onMessage: (message: string) => void;
}): ReactNode {
  const { t, locale } = useInterface();
  const [snapshots, setSnapshots] = useState<readonly SaveSnapshotView[] | null>(null);

  const reload = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    setSnapshots(await api.saves.list(gameKey));
  }, [gameKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    await api.saves.create(gameKey, savePath, t('saves.defaultLabel'));
    onMessage(t('saves.created'));
    await reload();
  }, [gameKey, savePath, t, onMessage, reload]);

  const onRestore = useCallback(
    async (snapshotId: string) => {
      const api = globalThis.window?.nexora;
      if (api === undefined) {
        return;
      }
      const result = await api.saves.restore(snapshotId, savePath);
      onMessage(result.ok ? t('saves.restored') : t('saves.restoreFailed'));
    },
    [savePath, onMessage, t],
  );

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('saves.title')}</strong>
          <span className="nx-subtitle hub-break">
            {t('saves.folder')}: {savePath}
          </span>
        </div>

        <div className="hub-row">
          <Button variant="primary" onClick={() => void onCreate()}>
            {t('saves.create')}
          </Button>
          <Badge tone="planned">{t('planned.badge')}</Badge>
        </div>

        {snapshots === null ? (
          <p className="nx-subtitle">{t('common.loading')}</p>
        ) : snapshots.length === 0 ? (
          <p className="nx-subtitle">{t('saves.empty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
            {snapshots.map((snapshot) => (
              <li key={snapshot.id} className="hub-row hub-row--between">
                <span className="nx-stack">
                  <strong>
                    #{snapshot.revision} · {snapshot.label}
                  </strong>
                  <span className="nx-subtitle">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(snapshot.createdAt))} ·{' '}
                    {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(snapshot.sizeBytes / 1_000_000)} MB
                  </span>
                </span>
                <Button onClick={() => void onRestore(snapshot.id)}>{t('saves.restore')}</Button>
              </li>
            ))}
          </ul>
        )}

        <p className="nx-subtitle">{t('planned.cloudSync')}</p>
      </div>
    </Card>
  );
}