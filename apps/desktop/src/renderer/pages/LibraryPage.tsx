import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { useLibrary, ErrorNote } from '../state/desktop.js';
import { searchLocalLibrary } from '../lib/catalog.js';
import { formatPlayTime } from '../lib/format.js';
import { GameTile } from '../components/GameTile.js';
import type { LibraryGame } from '@nexora/protocol';
import type { CollectionView, DesktopGameView } from '../../shared/preload-api.js';

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
  const [collections, setCollections] = useState<readonly CollectionView[] | null>(null);
  const [activeCollection, setActiveCollection] = useState<number | null>(null);
  const [collectionGames, setCollectionGames] = useState<readonly string[] | null>(null);

  const games = library.value ?? [];

  // Colecções: locais, com o filtro a mostrar só os jogos da colecção.
  const loadCollections = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    const list = await api.collections.list();
    setCollections(list);
    if (activeCollection !== null) {
      setCollectionGames(await api.collections.games(activeCollection));
    }
  }, [activeCollection]);

  useEffect(() => {
    void loadCollections();
  }, [loadCollections]);

  const onScan = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    const result = await api.scan.disks();
    setImportMessage(
      result.imported.length === 0
        ? t('scan.scanned', { count: result.scanned })
        : t('scan.done', { count: result.imported.length }),
    );
    library.reload();
  }, [library, t]);

  /**
   * Importação oficial: os manifestos das lojas no disco.
   *
   * O relatório é honesto — quantos títulos entraram, quantas entradas
   * ficaram de fora (ferramentas da Steam, pastas em falta) e o que as
   * lojas ainda não suportadas dizem. Nada de contacto com a Internet.
   */
  const onOfficialImport = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    const available = await api.scan.officialAvailable();
    if (!available.available) {
      setImportMessage(t('official.unavailable'));
      return;
    }
    const result = await api.scan.official();
    if (!result.ok) {
      setImportMessage(t('error.generic'));
      return;
    }
    const imported = result.imported ?? [];
    const skipped = (result.stores ?? []).reduce((total, entry) => total + entry.skipped, 0);
    setImportMessage(
      imported.length === 0
        ? t('official.none')
        : `${t('official.done', { count: imported.length })}${skipped > 0 ? ` ${t('official.skipped', { count: skipped })}` : ''}`,
    );
    library.reload();
  }, [library, t]);

  const hits = useMemo(() => {
    const inCollection =
      activeCollection === null || collectionGames === null
        ? games
        : games.filter((game) => collectionGames.includes(game.externalKey));

    if (search.trim() === '') {
      return inCollection;
    }
    const found = searchLocalLibrary(search, inCollection, 8);
    const byKey = new Map(found.map((hit) => [hit.game.id, hit]));
    return inCollection.filter((game) => byKey.has(game.externalKey));
  }, [games, search, activeCollection, collectionGames]);

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
        <span className="nx-subtitle">{t('library.count', { count: hits.length })}</span>
        <div className="hub-row">
          <Button onClick={() => void onScan()}>{t('scan.action')}</Button>
          {/* Importação oficial: lê os manifestos das lojas no disco. */}
          <Button onClick={() => void onOfficialImport()}>{t('official.action')}</Button>
          <Button variant="primary" onClick={() => void onImport()}>
            {t('import.choose')}
          </Button>
        </div>
      </div>

      {collections !== null && collections.length > 0 ? (
        <div className="hub-row">
          <Button
            aria-pressed={activeCollection === null}
            onClick={() => {
              setActiveCollection(null);
              setCollectionGames(null);
            }}
          >
            {t('library.filters.all')}
          </Button>
          {collections.map((collection) => (
            <Button
              key={collection.id}
              aria-pressed={activeCollection === collection.id}
              onClick={() => {
                const api = globalThis.window?.nexora;
                if (api === undefined) {
                  return;
                }
                setActiveCollection(collection.id);
                void api.collections.games(collection.id).then(setCollectionGames);
              }}
            >
              {collection.name} ({collection.count})
            </Button>
          ))}
        </div>
      ) : null}
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