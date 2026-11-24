import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Button,
  Card,
  EmptyState,
  GameCard,
  PlannedBadge,
  PlannedNotice,
  TextInput,
  useInterface,
} from '@nexora/ui';
import type { LibraryGame } from '@nexora/protocol';
import { steamPortraitUrl } from '@nexora/core';
import * as api from '../api/library.js';
import { accessToken } from '../api/client.js';

/**
 * Biblioteca (leitura).
 *
 * A grelha mostra o que o utilizador **tem**, e a barra de pesquisa usa o
 * mesmo motor do desktop (`searchGames`): "l" encontra League of Legends,
 * "mncft" encontra Minecraft. A web é leitura — escreve apenas o que é do
 * utilizador (favoritos).
 *
 * Os módulos que ainda não existem aparecem com o selo "Planeado": nenhum
 * botão finge funcionar.
 */
export function LibraryPage(): ReactNode {
  const { t, locale } = useInterface();
  const [entries, setEntries] = useState<readonly LibraryGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<readonly string[]>([]);
  const [synced, setSynced] = useState<readonly api.SyncedEntry[] | null>(null);

  const load = useCallback(async () => {
    if (accessToken() === null) {
      setEntries([]);
      return;
    }
    try {
      const response = await api.library();
      setEntries(response.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A biblioteca sincronizada: o metadado que o launcher subiu para a conta.
  useEffect(() => {
    if (accessToken() === null) {
      setSynced([]);
      return;
    }
    let cancelled = false;
    void api
      .syncedLibrary()
      .then((response) => {
        if (!cancelled) {
          setSynced(response.items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSynced([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sugestões ao digitar: a pesquisa é a do catálogo curado, servida pela API.
  useEffect(() => {
    if (query.trim().length < 1 || accessToken() === null) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void api
        .searchGames(query, 5)
        .then((response) => {
          if (!cancelled) {
            setSuggestions(response.items.map((item) => item.game.title));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const filtered = useMemo(() => {
    if (entries === null) {
      return [];
    }
    if (query.trim() === '') {
      return entries;
    }
    const needle = query.trim().toLowerCase();
    return entries.filter(
      (entry) => entry.title.toLowerCase().includes(needle) || entry.tags.some((tag) => tag.includes(needle)),
    );
  }, [entries, query]);

  async function onToggleFavorite(entry: LibraryGame): Promise<void> {
    try {
      const response = await api.setFavorite(entry.id, !entry.favorite);
      setEntries((current) =>
        (current ?? []).map((item) => (item.id === response.entry.id ? response.entry : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    }
  }

  return (
    <div className="nx-stack">
      <div className="nx-row nx-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('library.title')}</h1>
          <p className="nx-subtitle">{t('library.subtitle')}</p>
        </div>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      <PlannedNotice badge={t('planned.badge')} title={t('planned.title')} hint={t('planned.downloads')} />

      <TextInput
        label={t('library.search.placeholder')}
        id="library-search"
        hint={t('library.search.hint')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />

      {suggestions.length > 0 ? (
        <div className="nx-row">
          <span className="nx-label">{t('library.search.suggestions')}</span>
          {suggestions.map((suggestion) => (
            <Button key={suggestion} onClick={() => setQuery(suggestion)}>
              {suggestion}
            </Button>
          ))}
        </div>
      ) : null}

      {error === null ? null : (
        <p className="nx-banner">
          <span>{error}</span>
          <Button onClick={() => void load()}>{t('common.action.retry')}</Button>
        </p>
      )}

      {entries === null ? (
        <p>{t('common.loading')}</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={t('library.empty.title')} hint={t('library.empty.hint')} />
      ) : (
        <div className="hub-library-grid">
          {filtered.map((entry) => (
            <GameCard
              key={entry.id}
              game={entry}
              favorite={entry.favorite}
              favoriteLabel={t('details.favorite')}
              playLabel={t('common.action.play')}
              lastPlayedLabel={
                entry.lastPlayedAt === null
                  ? t('details.neverPlayed')
                  : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(entry.lastPlayedAt))
              }
              playTimeLabel={`${Math.round(entry.totalSeconds / 60)} min`}
              onSelect={() => undefined}
              onToggleFavorite={(gameId) => {
                const target = (entries ?? []).find((item) => item.id === gameId);
                if (target !== undefined) {
                  void onToggleFavorite(target);
                }
              }}
            />
          ))}
        </div>
      )}

      <div className="nx-stack">
        <div className="nx-row nx-row--between">
          <div className="nx-stack">
            <h2 className="nx-title">{t('web.synced.title')}</h2>
            <p className="nx-subtitle">{t('web.synced.subtitle')}</p>
          </div>
        </div>

        {synced === null ? (
          <p>{t('common.loading')}</p>
        ) : accessToken() === null ? (
          <EmptyState title={t('web.synced.title')} hint={t('web.synced.signIn')} />
        ) : synced.length === 0 ? (
          <EmptyState title={t('web.synced.title')} hint={t('web.synced.empty')} />
        ) : (
          <div className="hub-library-grid">
            {synced.map((entry) => (
              <div className="nx-card" key={entry.externalKey}>
                <div className="nx-stack">
                  <span className="nx-cover" style={{ aspectRatio: '2 / 3' }}>
                    {entry.steamAppId === null && entry.coverUrl === null ? (
                      <span aria-hidden="true">{entry.title.slice(0, 1).toUpperCase()}</span>
                    ) : (
                      <img
                        src={entry.coverUrl ?? steamPortraitUrl(entry.steamAppId ?? '')}
                        alt=""
                        loading="lazy"
                      />
                    )}
                  </span>
                  <strong>{entry.title}</strong>
                  <span className="nx-subtitle">
                    {entry.installed ? t('web.synced.installed') : t('web.synced.library')}
                    {entry.favorite ? ` · ${t('web.synced.favorite')}` : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Card>
        <div className="nx-row nx-row--between">
          <strong>{t('settings.storage.title')}</strong>
          <span className="nx-subtitle">{t('settings.storage.unknown')}</span>
        </div>
        <p className="nx-subtitle">{t('common.desktopOnly')}</p>
      </Card>
    </div>
  );
}