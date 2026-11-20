import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PlannedBadge, useInterface, type Translator } from '@nexora/ui';
import { accessToken } from '../lib/api.js';
import { useAuth } from '../state/auth.js';
import type { StoreGameView } from '../../shared/preload-api.js';

/**
 * Loja — directório de compras, não uma loja.
 *
 * A NEXORA não vende nem hospedeia jogos: mostra o directório com ligações
 * para **lojas oficiais**. Quem compra, compra na loja. A lista de desejos
 * exige conta — sem sessão, o botão explica o que falta em vez de falhar.
 */

/** Plataformas do filtro (chaves explícitas). */
const PLATFORMS = [
  { id: '', label: 'Todas' },
  { id: 'windows', label: 'Windows' },
  { id: 'linux', label: 'Linux' },
  { id: 'macos', label: 'macOS' },
] as const;

export function StorePage(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();
  const api = globalThis.window?.nexora;

  const [games, setGames] = useState<readonly StoreGameView[] | null>(null);
  const [wishlist, setWishlist] = useState<readonly string[]>([]);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('');
  const [hideAdult, setHideAdult] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    const result = await api.store.catalog(query, platform, hideAdult);
    if (!result.ok) {
      setMessage(result.message ?? t('error.generic'));
      setGames([]);
      return;
    }
    setGames(result.items ?? []);
    setMessage(null);

    // A lista de desejos exige conta: sem sessão, fica vazia.
    if (accessToken() !== null) {
      const list = await api.wishlist.list();
      if (list.ok && list.items !== undefined) {
        setWishlist(list.items.map((item) => item.gameId));
      }
    }
  }, [api, query, platform, hideAdult, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onWishlist = useCallback(
    async (gameId: string) => {
      if (api === undefined) {
        return;
      }
      if (accessToken() === null) {
        setMessage(t('store.signInRequired'));
        return;
      }
      const inList = wishlist.includes(gameId);
      const result = inList ? await api.wishlist.remove(gameId) : await api.wishlist.add(gameId);
      setMessage(result.ok ? (inList ? t('store.wishlist.removed') : t('store.wishlist.added')) : (result.message ?? t('error.generic')));
      await reload();
    },
    [api, wishlist, reload, t],
  );

  const onBuy = useCallback((game: StoreGameView) => {
    const link = game.links[0];
    if (link === undefined || api === undefined) {
      return;
    }
    // A compra acontece na loja oficial: abre no browser do sistema.
    void api.shell?.openExternal?.(link.url);
  }, [api]);

  const visible = useMemo(() => games ?? [], [games]);

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('store.title')}</h1>
          <p className="nx-subtitle">{t('store.subtitle')}</p>
        </div>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <div className="hub-row">
        <input
          className="nx-input"
          value={query}
          placeholder={t('store.search')}
          aria-label={t('store.search')}
          onChange={(event) => {
            setQuery(event.target.value);
          }}
        />
        {PLATFORMS.map((option) => (
          <Button
            key={option.id}
            aria-pressed={platform === option.id}
            onClick={() => {
              setPlatform(option.id);
            }}
          >
            {option.label}
          </Button>
        ))}
        <Button
          aria-pressed={hideAdult}
          onClick={() => {
            setHideAdult(!hideAdult);
          }}
        >
          {hideAdult ? t('store.hideAdult') : t('store.showAdult')}
        </Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState title={t('store.empty')} hint={t('store.empty.hint')} />
      ) : (
        <div className="hub-tile-grid">
          {visible.map((game) => {
            const link = game.links[0];
            const inWishlist = wishlist.includes(game.id);
            return (
              <Card key={game.id}>
                <div className="nx-stack">
                  <div className="nx-cover">
                    {game.cover === null ? (
                      <span aria-hidden="true">{game.title.slice(0, 1).toUpperCase()}</span>
                    ) : (
                      <img src={game.cover} alt="" loading="lazy" />
                    )}
                  </div>
                  <strong className="hub-tile__title">{game.title}</strong>
                  <span className="nx-subtitle">{game.tagline}</span>
                  <div className="hub-suggestions">
                    {game.platforms.map((item) => (
                      <Badge key={item}>{item}</Badge>
                    ))}
                    {game.adult ? <Badge tone="planned">18+</Badge> : null}
                  </div>
                  {link === undefined ? null : (
                    <span className="nx-subtitle">
                      {t('store.buyVia', { store: storeLabel(link.store, t) })}
                      {link.price === null ? '' : ` · ${new Intl.NumberFormat(locale, { style: 'currency', currency: link.currency ?? 'USD' }).format(link.price)}`}
                    </span>
                  )}
                  <div className="hub-row">
                    <Button variant="primary" onClick={() => onBuy(game)}>
                      {t('store.buy')}
                    </Button>
                    <Button
                      aria-pressed={inWishlist}
                      onClick={() => {
                        void onWishlist(game.id);
                      }}
                    >
                      {inWishlist ? t('store.wishlist.remove') : t('store.wishlist.add')}
                    </Button>
                  </div>
                  {user === null ? <span className="nx-subtitle">{t('store.signInRequired')}</span> : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Rótulo da loja (chave explícita, nunca dinâmica). */
function storeLabel(store: string, t: Translator): string {
  switch (store) {
    case 'steam':
      return 'Steam';
    case 'epic':
      return 'Epic Games';
    case 'gog':
      return 'GOG';
    default:
      return t('store.official');
  }
}