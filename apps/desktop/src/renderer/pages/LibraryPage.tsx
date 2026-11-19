import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { useLibrary, useRunner, ErrorNote } from '../state/desktop.js';
import { searchLocalLibrary } from '../lib/catalog.js';
import { formatDate, formatPlayTime } from '../lib/format.js';
import { GameTile } from '../components/GameTile.js';
import type { LibraryGame } from '@nexora/protocol';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Biblioteca — a pele do launcher.
 *
 * Herói com o jogo mais recente, "Continuar a jogar" (quem tem última sessão),
 * a grelha de todos os jogos e a pesquisa viva pelo motor do NEXORA. A
 * importação de pastas é a única forma de um jogo entrar: a NEXORA não
 * distribui jogos — e a interface diz-o.
 *
 * Os módulos que ainda não existem ficam numa linha "Em breve": honestidade
 * não ocupa a navegação principal como se existisse.
 */
export function LibraryPage({ onOpenGame }: { readonly onOpenGame: (gameId: string) => void }): ReactNode {
  const { t, locale } = useInterface();
  const library = useLibrary();
  const runner = useRunner();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const games = library.value ?? [];

  const hits = useMemo(() => {
    if (query.trim() === '') {
      return games;
    }
    const found = searchLocalLibrary(query, games, 8);
    const byKey = new Map(found.map((hit) => [hit.game.id, hit]));
    return games.filter((game) => byKey.has(game.externalKey));
  }, [games, query]);

  useEffect(() => {
    if (query.trim() === '') {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      setSuggestions(searchLocalLibrary(query, games, 5).map((hit) => hit.game.title));
    }, 120);
    return () => {
      clearTimeout(timer);
    };
  }, [query, games]);

  const onImport = useCallback(async () => {
    setImportMessage(null);
    const result = await library.importFolder();
    if (result === null) {
      return;
    }
    const skipped = result.skipped[0];
    if (result.imported.length === 0 && skipped !== undefined) {
      setImportMessage(skipped.reasonKey === 'cancelled' ? null : t('import.noExecutable'));
      return;
    }
    setImportMessage(t('import.done'));
  }, [library, t]);

  const onPlay = useCallback(
    async (gameId: string) => {
      const target = games.find((game) => game.externalKey === gameId);
      if (target === undefined) {
        return;
      }
      const result = await runner.launch(target.id);
      setMessage(
        result.ok
          ? t('runner.session.started')
          : t(result.reasonKey === 'missing-executable' ? 'details.executable.missing' : 'runner.launch.error'),
      );
    },
    [games, runner, t],
  );

  const mostRecent = useMemo(
    () =>
      games
        .filter((game) => game.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? ''))[0] ?? null,
    [games],
  );

  const continuing = useMemo(
    () =>
      games
        .filter((game) => game.lastPlayedAt !== null)
        .sort((left, right) => (right.lastPlayedAt ?? '').localeCompare(left.lastPlayedAt ?? ''))
        .slice(0, 6),
    [games],
  );

  if (library.loading) {
    return <p>{t('common.loading')}</p>;
  }

  return (
    <div className="nx-stack">
      {games.length === 0 ? (
        <EmptyState title={t('library.empty.title')} hint={t('library.empty.hint')}>
          <div className="hub-row">
            <Button variant="primary" onClick={() => void onImport()}>
              {t('import.choose')}
            </Button>
            <span className="nx-subtitle">{t('import.hint')}</span>
          </div>
        </EmptyState>
      ) : null}

      {mostRecent !== null ? (
        <section className="hub-hero">
          <span className="nx-label">{t('library.hero.label')}</span>
          <h1 className="hub-hero__title">{mostRecent.title}</h1>
          <p className="hub-hero__meta">
            {formatPlayTime(mostRecent.totalSeconds, locale, t)} · {t('details.lastPlayed')}{' '}
            {formatDate(mostRecent.lastPlayedAt, locale, t('details.neverPlayed'))}
          </p>
          <div className="hub-row">
            <Button variant="primary" onClick={() => void onPlay(mostRecent.externalKey)}>
              {t('common.action.play')}
            </Button>
            <Button onClick={() => onOpenGame(mostRecent.externalKey)}>{t('details.title')}</Button>
          </div>
        </section>
      ) : null}

      <div className="hub-row hub-row--between">
        <label className="nx-stack" style={{ flex: 1, minWidth: 0 }}>
          <span className="nx-label">{t('library.search.placeholder')}</span>
          <input
            className="nx-input"
            value={query}
            placeholder={t('library.search.placeholder')}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </label>
        <Button variant="primary" onClick={() => void onImport()}>
          {t('import.choose')}
        </Button>
      </div>
      <p className="nx-subtitle">{t('import.hint')}</p>

      {suggestions.length > 0 ? (
        <div className="hub-row">
          <span className="nx-label">{t('library.search.suggestions')}</span>
          {suggestions.map((suggestion) => (
            <Button key={suggestion} onClick={() => setQuery(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      {importMessage === null ? null : <p className="nx-banner"><span>{importMessage}</span></p>}
      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      {library.error === null ? null : <ErrorNote message={library.error} retry={library.reload} />}

      {continuing.length > 0 ? (
        <section className="hub-section">
          <div className="hub-section__head">
            <strong>{t('library.continue')}</strong>
          </div>
          <div className="hub-continue-row">
            {continuing.map((game) => (
              <div key={game.externalKey} style={{ minWidth: 0 }}>
                <GameTile
                  game={toLibraryGame(game)}
                  favorite={game.favorite}
                  playTimeLabel={formatPlayTime(game.totalSeconds, locale, t)}
                  metaLabel={formatDate(game.lastPlayedAt, locale, t('details.neverPlayed'))}
                  playLabel={t('common.action.play')}
                  onSelect={onOpenGame}
                  onPlay={(gameId) => {
                    void onPlay(gameId);
                  }}
                  onToggleFavorite={(gameId) => {
                    const target = games.find((item) => item.externalKey === gameId);
                    if (target !== undefined) {
                      void library.toggleFavorite(target.id);
                    }
                  }}
                />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="hub-section">
        <div className="hub-section__head">
          <strong>{t('library.all')}</strong>
          <span className="nx-subtitle">{t('library.count', { count: games.length })}</span>
        </div>
        {hits.length === 0 ? (
          <EmptyState title={t('library.search.noResults')} hint={t('library.search.hint')} />
        ) : (
          <div className="hub-tile-grid">
            {hits.map((game) => (
              <GameTile
                key={game.externalKey}
                game={toLibraryGame(game)}
                favorite={game.favorite}
                playTimeLabel={formatPlayTime(game.totalSeconds, locale, t)}
                metaLabel={game.tags.join(' · ')}
                playLabel={t('common.action.play')}
                onSelect={onOpenGame}
                onPlay={(gameId) => {
                  void onPlay(gameId);
                }}
                onToggleFavorite={(gameId) => {
                  const target = games.find((item) => item.externalKey === gameId);
                  if (target !== undefined) {
                    void library.toggleFavorite(target.id);
                  }
                }}
              />
            ))}
          </div>
        )}
      </section>

      <section className="hub-section">
        <div className="hub-section__head">
          <strong>{t('library.comingSoon')}</strong>
          <PlannedBadge label={t('planned.badge')} />
        </div>
        <div className="hub-planned-row">
          <Badge tone="planned">{t('nav.cloudSaves')}</Badge>
          <Badge tone="planned">{t('nav.friends')}</Badge>
          <Badge tone="planned">{t('planned.store')}</Badge>
          <Badge tone="planned">{t('planned.overlay')}</Badge>
        </div>
      </section>
    </div>
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