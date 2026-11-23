import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, PlannedBadge, useInterface, type Translator } from '@nexora/ui';
import { useLibrary, useRunner } from '../state/desktop.js';
import { formatPlayTime } from '../lib/format.js';
import { accessToken } from '../lib/api.js';
import { GameShelf } from '../components/GameShelf.js';
import { coverUrl } from '../lib/media.js';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Início — a montra do launcher.
 *
 * Destaque com o jogo da última sessão, separadores com **dados reais** da
 * biblioteca (Quentes = mais jogados; Jogados recentemente = última sessão;
 * Para descobrir = nunca jogados) e o botão "Surpreenda-me", que escolhe um
 * jogo ao calhas entre os que existem.
 *
 * Nada de "Top da semana" inventado: sem medição semanal, o separador não
 * existe — a honestidade do produto também é interface.
 */

/** As acções do runner de que a Home precisa. */
interface RunnerActions {
  readonly launch: (id: string, token?: string) => Promise<{ readonly ok: boolean; readonly reasonKey?: string }>;
}

export function HomePage({
  onOpenGame,
  onPlay,
  onToggleFavorite,
}: {
  readonly onOpenGame: (gameId: string) => void;
  readonly onPlay: (gameId: string) => void;
  readonly onToggleFavorite: (gameId: string) => void;
}): ReactNode {
  const { t, locale } = useInterface();
  const library = useLibrary();
  const runner = useRunner();
  const [message, setMessage] = useState<string | null>(null);

  const games = library.value ?? [];

  const featured = useMemo(
    () =>
      [...games]
        .filter((game) => game.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? ''))[0] ??
      [...games].sort((left, right) => right.totalSeconds - left.totalSeconds)[0] ??
      null,
    [games],
  );

  const rows = useMemo(
    () => ({
      hot: [...games].sort((left, right) => right.totalSeconds - left.totalSeconds),
      recent: [...games]
        .filter((game) => game.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? '')),
      discover: games.filter((game) => game.totalSeconds === 0),
    }),
    [games],
  );

  const onSurprise = useCallback(() => {
    if (games.length === 0) {
      return;
    }
    const pick = games[Math.floor(Math.random() * games.length)];
    if (pick !== undefined) {
      onOpenGame(pick.externalKey);
    }
  }, [games, onOpenGame]);

  if (library.loading) {
    return <p>{t('common.loading')}</p>;
  }

  return (
    <div className="nx-stack">
      {games.length === 0 ? (
        <EmptyState title={t('library.empty.title')} hint={t('home.empty')}>
          <span className="nx-subtitle">{t('import.hint')}</span>
        </EmptyState>
      ) : null}

      {featured !== null ? (
        <section
          className="hub-featured"
          style={coverUrl(featured.cover) === null ? undefined : { backgroundImage: `url("${coverUrl(featured.cover)}")` }}
        >
          <span className="hub-featured__label">{t('home.featured')}</span>
          <strong className="hub-featured__title">{featured.title}</strong>
          <p className="hub-featured__desc">
            {t('home.featured.subtitle')} · {formatPlayTime(featured.totalSeconds, locale, t)}
          </p>
          <div className="hub-row">
            <Button
              variant="primary"
              onClick={() => {
                void onPlayFeatured(featured, runner, setMessage, t);
              }}
            >
              {t('common.action.play')}
            </Button>
            <Button onClick={() => onOpenGame(featured.externalKey)}>{t('details.title')}</Button>
          </div>
        </section>
      ) : null}

      <div className="hub-row hub-row--between">
        <p className="nx-subtitle">{t('home.subtitle')}</p>
        <Button onClick={onSurprise}>✨ {t('home.surprise')}</Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      {library.error === null ? null : <p className="nx-banner"><span>{library.error}</span></p>}

      {/* Prateleiras: cada uma com dados reais — uma sem jogos não existe. */}
      <GameShelf
        title={t('home.tab.hot')}
        games={rows.hot}
        hoursLabelOf={(game) => (game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null)}
        playLabel={t('common.action.play')}
        onSelect={onOpenGame}
        onPlay={onPlay}
        onToggleFavorite={onToggleFavorite}
      />
      <GameShelf
        title={t('home.tab.recent')}
        games={rows.recent}
        hoursLabelOf={(game) => (game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null)}
        playLabel={t('common.action.play')}
        onSelect={onOpenGame}
        onPlay={onPlay}
        onToggleFavorite={onToggleFavorite}
      />
      <GameShelf
        title={t('home.tab.discover')}
        games={rows.discover}
        hoursLabelOf={(game) => (game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null)}
        playLabel={t('common.action.play')}
        onSelect={onOpenGame}
        onPlay={onPlay}
        onToggleFavorite={onToggleFavorite}
      />

      <div className="hub-planned-row">
        <PlannedBadge label={t('planned.badge')} />
        <Badge tone="planned">{t('nav.cloudSaves')}</Badge>
        <Badge tone="planned">{t('nav.friends')}</Badge>
        <Badge tone="planned">{t('planned.store')}</Badge>
      </div>
    </div>
  );
}

/** Joga o destaque (o botão do herói). */
async function onPlayFeatured(
  game: DesktopGameView,
  runner: RunnerActions,
  setMessage: (message: string) => void,
  t: Translator,
): Promise<void> {
  const result = await runner.launch(game.id, accessToken() ?? undefined);
  setMessage(
    result.ok
      ? t('runner.session.started')
      : t(result.reasonKey === 'missing-executable' ? 'details.executable.missing' : 'runner.launch.error'),
  );
}


/** Pesquisa local reexportada (o separador filtra o que existe). */