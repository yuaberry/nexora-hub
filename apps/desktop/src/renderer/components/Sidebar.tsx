import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, useInterface } from '@nexora/ui';
import { useLibrary } from '../state/desktop.js';
import { useAuth } from '../state/auth.js';
import { initials } from './GameTile.js';
import type { DownloadTaskView } from '../../shared/preload-api.js';
import { coverFit, coverUrl } from '../lib/media.js';
import { apiRequest } from '../lib/api.js';
import { GameImage } from './GameImage.js';

/**
 * Barra lateral do launcher — marca, navegação, biblioteca e estado.
 *
 * A biblioteca fica **ao alcance de um clique**: a lista filtra enquanto se
 * escreve e abre os detalhes do jogo. O rodapé diz o que a fila de downloads
 * está a fazer — com o número real de tarefas activas, nunca um texto fixo.
 *
 * A conta é opcional: sem sessão, a entrada leva ao ecrã de login; com
 * sessão, mostra quem está e oferece trocar de conta.
 */
export function Sidebar({
  route,
  activeGameId,
  onNavigate,
  onSelectGame,
}: {
  readonly route: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'optimizer' | 'chat' | 'achievements' | 'benchmark' | 'clans' | 'events' | 'diagnostics' | 'remotePlay' | 'account' | 'plugins';
  /** Jogo em detalhe (para marcar na lista), ou `null`. */
  readonly activeGameId: string | null;
  readonly onNavigate: (target: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'clans' | 'events' | 'diagnostics' | 'remotePlay' | 'optimizer' | 'chat' | 'achievements' | 'benchmark' | 'account' | 'plugins') => void;
  readonly onSelectGame: (gameId: string) => void;
}): ReactNode {
  const { t } = useInterface();
  const library = useLibrary();
  const { user, switchAccount } = useAuth();
  const [filter, setFilter] = useState('');
  const [active, setActive] = useState<readonly DownloadTaskView[]>([]);

  const games = library.value ?? [];

  // O selo equipado (cosmético do tipo `badge`): aparece ao lado do nome —
  // é a prova de que o que se comprou se vê.
  const [badge, setBadge] = useState<string | null>(null);
  const loadBadge = useCallback(async () => {
    if (user === null) {
      setBadge(null);
      return;
    }
    try {
      const body = await apiRequest<{ items?: readonly { id: string; equipped: boolean }[] }>('/api/v1/cosmetics');
      const equipado = body.items?.find((item) => item.equipped);
      setBadge(equipado?.id ?? null);
    } catch {
      setBadge(null);
    }
  }, [user]);

  useEffect(() => {
    void loadBadge();
  }, [loadBadge]);

  // Comprar, equipar ou tirar um selo noutra página actualiza o daqui: o
  // aviso vem do cartão de cosméticos, e a barra lateral volta a lê-lo.
  useEffect(() => {
    const onChange = (): void => {
      void loadBadge();
    };
    globalThis.addEventListener('nexora:cosmetics-changed', onChange);
    return () => {
      globalThis.removeEventListener('nexora:cosmetics-changed', onChange);
    };
  }, [loadBadge]);

  const loadActive = useCallback(async () => {
    const api = globalThis.window?.nexora;
    if (api === undefined) {
      return;
    }
    const list = await api.downloads.list();
    const tasks = list.tasks;
    setActive(tasks.filter((task) => task.state === 'downloading' || task.state === 'queued' || task.state === 'paused'));
  }, []);

  useEffect(() => {
    void loadActive();
    const timer = setInterval(() => {
      void loadActive();
    }, 3_000);
    return () => {
      clearInterval(timer);
    };
  }, [loadActive]);

  const filtered = useMemo(() => {
    if (filter.trim() === '') {
      return games;
    }
    const needle = filter.trim().toLowerCase();
    return games.filter((game) => game.title.toLowerCase().includes(needle));
  }, [games, filter]);

  const items: readonly { readonly id: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'clans' | 'events' | 'diagnostics' | 'remotePlay' | 'optimizer' | 'chat' | 'achievements' | 'benchmark' | 'account' | 'plugins'; readonly label: string }[] = [
    { id: 'home', label: t('nav.home') },
    { id: 'library', label: t('nav.library') },
    { id: 'downloads', label: t('nav.downloads') },
    { id: 'settings', label: t('nav.settings') },
    { id: 'store', label: t('nav.store') },
    { id: 'stats', label: t('nav.stats') },
    { id: 'family', label: t('nav.family') },
    { id: 'friends', label: t('nav.friends') },
    { id: 'clans', label: t('nav.clans') },
    { id: 'events', label: t('nav.events') },
    { id: 'diagnostics', label: t('nav.diagnostics') },
    { id: 'remotePlay', label: t('nav.remotePlay') },
    { id: 'optimizer', label: t('nav.optimizer') },
    { id: 'chat', label: t('nav.chat') },
    { id: 'achievements', label: t('nav.achievements') },
    { id: 'benchmark', label: t('nav.benchmark') },
    { id: 'plugins', label: t('nav.plugins') },
    { id: 'account', label: user === null ? t('auth.login') : t('auth.account') },
  ];

  return (
    <aside className="hub-sidebar">
      <div className="hub-sidebar__brand">
        <span className="hub-brand__mark" aria-hidden="true">NX</span>
        <span className="hub-brand__name">{t('common.app.name')}</span>
      </div>

      <nav className="hub-sidebar__nav" aria-label={t('common.app.name')}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`hub-sidebar__item${item.id === route ? ' hub-sidebar__item--active' : ''}`}
            aria-current={item.id === route ? 'page' : undefined}
            onClick={() => {
              onNavigate(item.id);
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="hub-sidebar__section">
        <span className="hub-sidebar__label">{t('sidebar.library')}</span>
        <input
          className="nx-input"
          value={filter}
          placeholder={t('sidebar.filter')}
          aria-label={t('sidebar.filter')}
          onChange={(event) => {
            setFilter(event.target.value);
          }}
        />
        <div className="hub-lib-list">
          {filtered.length === 0 ? (
            <span className="nx-subtitle">{t('sidebar.library.empty')}</span>
          ) : (
            filtered.map((game) => (
              <button
                key={game.externalKey}
                type="button"
                className={`hub-lib-item${game.externalKey === activeGameId ? ' hub-lib-item--active' : ''}`}
                onClick={() => {
                  onSelectGame(game.externalKey);
                }}
              >
                <span className="hub-lib-item__thumb">
                  <GameImage
                    src={coverUrl(game.cover)}
                    fit={coverFit(game.cover)}
                    alt=""
                    fallback={<span aria-hidden="true">{initials(game.title)}</span>}
                  />
                </span>
                <span className="hub-lib-item__title">{game.title}</span>
              </button>
            ))
          )}
        </div>
      </section>

      <div className="hub-sidebar__footer">
        {active.length === 0 ? t('sidebar.noDownloads') : t('sidebar.downloadsActive', { count: active.length })}
        {user === null ? null : (
          <div className="nx-stack" style={{ marginTop: '0.5rem' }}>
            <span className="hub-break">
              {t('auth.signedInAs', { name: user.displayName })}
              {badge === null ? null : <Badge>{t(badgeName(badge))}</Badge>}
            </span>
            <button type="button" className="hub-sidebar__item" onClick={switchAccount}>
              {t('auth.switch')}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
/** A chave do nome do selo equipado (explícita — o catálogo é conhecido). */
function badgeName(id: string): 'cosmetic.badge.owl.name' | 'cosmetic.badge.marathon.name' | 'cosmetic.badge.century.name' {
  switch (id) {
    case 'badge-owl':
      return 'cosmetic.badge.owl.name';
    case 'badge-marathon':
      return 'cosmetic.badge.marathon.name';
    default:
      return 'cosmetic.badge.century.name';
  }
}
