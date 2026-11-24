import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Badge, Button, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { useLibrary, ErrorNote } from '../state/desktop.js';
import { apiRequest, ApiError } from '../lib/api.js';
import { searchLocalLibrary } from '../lib/catalog.js';
import { formatPlayTime } from '../lib/format.js';
import { GameCapsule } from '../components/GameCapsule.js';
import type { CollectionView } from '../../shared/preload-api.js';

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
  const [syncing, setSyncing] = useState(false);
  const [syncingAccount, setSyncingAccount] = useState(false);
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

  /**
   * Sincroniza com o que a Steam tem agora.
   *
   * A Steam actualiza os manifestos quando o jogo muda de versão — e este
   * comando volta a lê-los: jogos novos entram, títulos diferentes são
   * corrigidos. A capa escolhida pelo utilizador nunca é mexida.
   */
  const onSyncSteam = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    setSyncing(true);
    const result = await api.steam.sync();
    setSyncing(false);
    if (!result.ok) {
      setImportMessage(result.message ?? t('error.generic'));
      return;
    }
    const updated = result.updated ?? 0;
    const added = result.added ?? 0;
    setImportMessage(
      added === 0 && updated === 0
        ? t('steam.sync.unchanged')
        : t('steam.sync.done', { added, updated }),
    );
    library.reload();
  }, [library, t]);

  /**
   * Hidrata as capas com a cápsula pública da loja.
   *
   * Corre uma vez por sessão da página: busca a arte vertical pelo appid (o
   * processo principal fala com a Internet) e guarda-a no disco. A grelha
   * mostra placeholders enquanto isso, e a biblioteca recarrega no fim — a
   * mesma capa passa a existir em qualquer máquina.
   */
  const hydrated = useRef(false);
  useEffect(() => {
    const api = globalThis.window?.nexora;
    if (hydrated.current || api === undefined) {
      return;
    }
    hydrated.current = true;
    void api.covers.hydrate().then(() => {
      library.reload();
    });
  }, [library]);

  /**
   * Sincroniza a biblioteca com a conta NEXORA.
   *
   * Sobe **metadado**: título, appid, favorito e o tempo medido. Caminhos
   * locais e executáveis ficam nesta máquina — a conta não precisa de saber
   * onde os ficheiros estão. A capa sobe só quando já é uma URL pública (a
   * web reconstrói a cápsula a partir do appid).
   */
  const onSyncAccount = useCallback(async () => {
    const jogos = library.value ?? [];
    if (jogos.length === 0) {
      return;
    }
    setSyncingAccount(true);
    try {
      const relatorio = await apiRequest<{ added: number; updated: number }>('/api/v1/library/sync', {
        method: 'PUT',
        body: {
          entries: jogos.map((jogo) => ({
            externalKey: jogo.externalKey,
            title: jogo.title,
            steamAppId: jogo.steamAppId,
            coverUrl: jogo.cover !== null && jogo.cover.startsWith('http') ? jogo.cover : null,
            installed: jogo.installed,
            favorite: jogo.favorite,
            totalSeconds: jogo.totalSeconds,
          })),
        },
      });
      setImportMessage(t('library.syncAccount.done', { added: relatorio.added, updated: relatorio.updated }));
    } catch (error) {
      setImportMessage(error instanceof ApiError ? error.message : t('library.syncAccount.failed'));
    }
    setSyncingAccount(false);
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
          {/* Sincronização: o que mudou na Steam desde a última vez. */}
          <Button onClick={() => void onSyncSteam()} disabled={syncing}>
            {syncing ? t('steam.sync.running') : t('steam.sync.action')}
          </Button>
          {/* Sincronização com a conta: o metadado sobe, os ficheiros ficam. */}
          <Button onClick={() => void onSyncAccount()} disabled={syncingAccount}>
            {syncingAccount ? t('steam.sync.running') : t('library.syncAccount')}
          </Button>
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
        <div className="hub-capsule-grid">
          {hits.map((game) => (
            <GameCapsule
              key={game.externalKey}
              id={game.externalKey}
              title={game.title}
              cover={game.cover}
              installed={game.installed}
              // A marca de horas só aparece a partir de uma hora jogada —
              // como nas lojas: um zero não diz nada.
              hoursLabel={game.totalSeconds >= 3600 ? formatPlayTime(game.totalSeconds, locale, t) : null}
              favorite={game.favorite}
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
