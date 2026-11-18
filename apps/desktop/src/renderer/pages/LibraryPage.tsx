import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Button, EmptyState, GameCard, PlannedBadge, useInterface } from '@nexora/ui';
import type { LibraryGame } from '@nexora/protocol';
import { useLibrary, useRunner, ErrorNote } from '../state/desktop.js';
import { searchLocalLibrary } from '../lib/catalog.js';
import { formatDate, formatPlayTime } from '../lib/format.js';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Biblioteca local do launcher.
 *
 * Mostra o que o utilizador **tem**: pastas locais importadas. A barra de
 * pesquisa é a do motor do NEXORA (`searchGames`) — "l" encontra League of
 * Legends, "mncft" encontra Minecraft — e só devolve jogos instalados.
 * Importar é escolher uma pasta: a NEXORA não distribui nada.
 */
export function LibraryPage({ onOpenGame }: { readonly onOpenGame: (gameId: string) => void }): ReactNode {
  const { t, locale } = useInterface();
  const library = useLibrary();
  const runner = useRunner();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const games = library.value ?? [];

  const hits = useMemo(() => {
    if (query.trim() === '') {
      return games.map((game) => ({ game, match: null as string | null }));
    }
    return searchLocalLibrary(query, games, 8).map((hit) => ({ game: toView(hit.game.id, games), match: hit.match }));
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

  /** Lança um jogo pelo identificador de catálogo (chave externa). */
  const onPlay = useCallback(
    async (gameId: string) => {
      const target = games.find((game) => game.externalKey === gameId);
      if (target === undefined) {
        return;
      }
      const result = await runner.launch(target.id);
      if (!result.ok) {
        setImportMessage(t(result.reasonKey === 'missing-executable' ? 'details.executable.missing' : 'runner.launch.error'));
      }
    },
    [games, runner, t],
  );

  return (
    <div className="nx-stack">
      <div className="nx-row nx-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('library.title')}</h1>
          <p className="nx-subtitle">{t('library.subtitle')}</p>
        </div>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      <div className="hub-row">
        <Button variant="primary" onClick={() => void onImport()}>
          {t('import.choose')}
        </Button>
        <span className="nx-subtitle">{t('import.hint')}</span>
      </div>

      {importMessage === null ? null : <p className="nx-subtitle">{importMessage}</p>}

      <label className="nx-stack">
        <span className="nx-label">{t('library.search.placeholder')}</span>
        <input
          className="nx-input"
          value={query}
          placeholder={t('library.search.placeholder')}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        <span className="nx-subtitle">{t('library.search.hint')}</span>
      </label>

      {suggestions.length > 0 ? (
        <div className="hub-suggestions">
          <span className="nx-label">{t('library.search.suggestions')}</span>
          {suggestions.map((suggestion) => (
            <Button key={suggestion} onClick={() => setQuery(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      {library.error === null ? null : <ErrorNote message={library.error} retry={library.reload} />}

      {library.loading ? (
        <p>{t('common.loading')}</p>
      ) : games.length === 0 ? (
        <EmptyState title={t('library.empty.title')} hint={t('library.empty.hint')} />
      ) : hits.length === 0 ? (
        <EmptyState title={t('library.search.noResults')} hint={t('library.search.hint')} />
      ) : (
        <div className="hub-library-grid">
          {hits.map(({ game }) => (
            <GameCard
              key={game.id}
              game={toLibraryGame(game)}
              favorite={game.favorite}
              favoriteLabel={t('details.favorite')}
              playLabel={t('common.action.play')}
              lastPlayedLabel={formatDate(game.lastPlayedAt, locale, t('details.neverPlayed'))}
              playTimeLabel={formatPlayTime(game.totalSeconds, locale, t)}
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

      {runner.value !== null && runner.value.length > 0 ? (
        <p className="nx-banner">
          <span>{t('runner.session.started')}</span>
        </p>
      ) : null}
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

/** Encontra a vista local correspondente a um identificador de catálogo. */
function toView(gameId: string, games: readonly DesktopGameView[]): DesktopGameView {
  const found = games.find((game) => game.externalKey === gameId);
  if (found === undefined) {
    throw new Error('Jogo não encontrado na biblioteca local.');
  }
  return found;
}