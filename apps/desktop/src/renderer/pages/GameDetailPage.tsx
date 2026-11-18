import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { useLibrary, useRunner, ErrorNote } from '../state/desktop.js';
import { formatDate, formatPlayTime } from '../lib/format.js';

/**
 * Detalhes do jogo.
 *
 * A capa é o ficheiro local; sem ficheiro, o placeholder do tema (nunca uma
 * imagem inventada). O tempo jogado é medido localmente — sincronizar com a
 * conta é fase futura, e a interface diz-o.
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
      <div className="nx-row nx-row--between">
        <Button onClick={onBack}>{t('common.action.back')}</Button>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      <div className="hub-row" style={{ alignItems: 'flex-start' }}>
        <div className="nx-cover hub-cover-large">
          {game.cover === null ? (
            <span aria-hidden="true">{game.title.slice(0, 1).toUpperCase()}</span>
          ) : (
            <img src={game.cover} alt="" />
          )}
        </div>

        <div className="nx-stack" style={{ flex: 1, minWidth: 0 }}>
          <h1 className="nx-title">{game.title}</h1>

          <dl className="nx-stack">
            <div className="hub-row">
              <dt className="nx-label">{t('details.installPath')}</dt>
              <dd className="hub-break" style={{ margin: 0 }}>{game.installPath}</dd>
            </div>
            <div className="hub-row">
              <dt className="nx-label">{t('details.executablePath')}</dt>
              <dd className="hub-break" style={{ margin: 0 }}>{game.executablePath}</dd>
            </div>
            <div className="hub-row">
              <dt className="nx-label">{t('details.playedTime')}</dt>
              <dd style={{ margin: 0 }}>{formatPlayTime(game.totalSeconds, locale, t)}</dd>
            </div>
            <div className="hub-row">
              <dt className="nx-label">{t('details.lastPlayed')}</dt>
              <dd style={{ margin: 0 }}>{formatDate(game.lastPlayedAt, locale, t('details.neverPlayed'))}</dd>
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

      <Card>
        <div className="nx-stack">
          <strong>{t('planned.title')}</strong>
          <span className="nx-subtitle">{t('planned.cloudSync')}</span>
          <Badge tone="planned">{t('planned.badge')}</Badge>
        </div>
      </Card>
    </div>
  );
}