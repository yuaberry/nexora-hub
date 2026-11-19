import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { useLibrary, ErrorNote } from '../state/desktop.js';
import { searchLocalLibrary } from '../lib/catalog.js';
import { formatPlayTime } from '../lib/format.js';
import { GameTile } from '../components/GameTile.js';
import type { LibraryGame } from '@nexora/protocol';
import type { DesktopGameView } from '../../shared/preload-api.js';

/**
 * Biblioteca — todos os jogos, com a pesquisa do cabeçalho.
 *
 * A pesquisa é a do motor do NEXORA (`searchGames`): "l" encontra League of
 * Legends, "mncft" encontra Minecraft — e só devolve jogos instalados. O herói
 * e as linhas vivem no Início; aqui é a grelha completa.
 */
export function LibraryPage({
  search,
  onOpenGame,
  onPlay,
  onToggleFavorite,
}: {
  readonly search: string;
  readonly onOpenGame: (gameId: string) => void;
  readonly onPlay: (gameId: string) => void;
  readonly onToggleFavorite: (gameId: string) => void;
}): ReactNode {
  const { t, locale } = useInterface();
  const library = useLibrary();
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const games = library.value ?? [];

  const hits = useMemo(() => {
    if (search.trim() === '') {
      return games;
    }
    const found = searchLocalLibrary(search, games, 8);
    const byKey = new Map(found.map((hit) => [hit.game.id, hit]));
    return games.filter((game) => byKey.has(game.externalKey));
  }, [games, search]);

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

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <span className="nx-subtitle">{t('library.count', { count: games.length })}</span>
        <Button variant="primary" onClick={() => void onImport()}>
          {t('import.choose')}
        </Button>
      </div>
      <p className="nx-subtitle">{t('import.hint')}</p>

      {importMessage === null ? null : <p className="nx-banner"><span>{importMessage}</span></p>}
      {library.error === null ? null : <ErrorNote message={library.error} retry={library.reload} />}

      {library.loading ? (
        <p>{t('common.loading')}</p>
      ) : games.length === 0 ? (
        <EmptyState title={t('library.empty.title')} hint={t('library.empty.hint')}>
          <Button variant="primary" onClick={() => void onImport()}>
            {t('import.choose')}
          </Button>
        </EmptyState>
      ) : hits.length === 0 ? (
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
        <Badge tone="planned">{t('planned.overlay')}</Badge>
      </div>
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