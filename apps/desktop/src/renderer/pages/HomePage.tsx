import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, PlannedBadge, useInterface, type Translator } from '@nexora/ui';
import { useLibrary, useRunner } from '../state/desktop.js';
import { formatPlayTime } from '../lib/format.js';
import { accessToken } from '../lib/api.js';
import { GameTile } from '../components/GameTile.js';
import type { LibraryGame } from '@nexora/protocol';
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

/** Separadores do Início (chaves explícitas, nunca dinâmicas). */
const TABS = [
  { id: 'hot', key: 'home.tab.hot' },
  { id: 'recent', key: 'home.tab.recent' },
  { id: 'discover', key: 'home.tab.discover' },
] as const;

type TabId = (typeof TABS)[number]['id'];

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
  const [tab, setTab] = useState<TabId>('hot');
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

  const active = rows[tab];

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
        <section className="hub-featured">
          <span className="hub-featured__label">{t('home.featured')}</span>
          <h2 className="hub-featured__title">{featured.title}</h2>
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
            <Badge tone="planned">{t('planned.badge')}</Badge>
          </div>
        </section>
      ) : null}

      <div className="hub-tabs">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`hub-tab${entry.id === tab ? ' hub-tab--active' : ''}`}
            aria-pressed={entry.id === tab}
            onClick={() => {
              setTab(entry.id);
            }}
          >
            {t(entry.key)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <Button onClick={onSurprise}>✨ {t('home.surprise')}</Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      {library.error === null ? null : <p className="nx-banner"><span>{library.error}</span></p>}

      {active.length === 0 ? (
        <EmptyState title={t('library.search.noResults')} hint={t('library.search.hint')} />
      ) : (
        <div className="hub-tile-grid">
          {active.map((game) => (
            <GameTile
              key={game.externalKey}
              game={toLibraryGame(game)}
              favorite={game.favorite}
              playTimeLabel={formatPlayTime(game.totalSeconds, locale, t)}
              metaLabel={game.tags.join(' · ')}
              playLabel={t('common.action.play')}
              onSelect={onOpenGame}
              onPlay={onPlay}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>
      )}

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

/** Converte uma vista local na entrada de biblioteca do contrato. */
function toLibraryGame(view: DesktopGameView): LibraryGame {
  return {
    id: view.externalKey,
    title: view.title,
    cover: view.cover,
    provider: 'local',
    tags: view.tags,
    adult: false,
    installPath: view.installPath,
    executablePath: view.executablePath,
    favorite: view.favorite,
    collections: [],
    lastPlayedAt: view.lastPlayedAt,
    totalSeconds: view.totalSeconds,
  };
}

/** Pesquisa local reexportada (o separador filtra o que existe). */