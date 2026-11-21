import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { InterfaceProvider, useDocumentPreferences, useInterface, type Translator } from '@nexora/ui';
import { AppShell } from './components/AppShell.js';
import { HomePage } from './pages/HomePage.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { GameDetailPage } from './pages/GameDetailPage.js';
import { DownloadsPage } from './pages/DownloadsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { PlannedPage } from './pages/PlannedPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { StorePage } from './pages/StorePage.js';
import { StatsPage } from './pages/StatsPage.js';
import { FamilyPage } from './pages/FamilyPage.js';
import { FriendsPage } from './pages/FriendsPage.js';
import { OptimizerPage } from './pages/OptimizerPage.js';
import { ChatPage } from './pages/ChatPage.js';
import { AchievementsPage } from './pages/AchievementsPage.js';
import { BenchmarkPage } from './pages/BenchmarkPage.js';
import { AuthProvider } from './state/auth.js';
import { useLibrary, useRunner } from './state/desktop.js';
import type { DesktopGameView } from '../shared/preload-api.js';

/**
 * Aplicação do launcher.
 *
 * A navegação é um estado simples — o esquema interno serve o `index.html`
 * para qualquer caminho (*fallback* SPA) — mas com **histórico real**: o botão
 * de voltar do cabeçalho desfaz a navegação, como em qualquer launcher. Módulos
 * que ainda não existem aparecem com selo "Planeado".
 */

/** Módulos planeados (só tipos nesta fase). */
export type PlannedModule = 'cloudSaves' | 'friends';

/** Rota activa. */
export type Route =
  | { readonly name: 'home' }
  | { readonly name: 'library' }
  | { readonly name: 'details'; readonly gameId: string }
  | { readonly name: 'downloads' }
  | { readonly name: 'settings' }
  | { readonly name: 'store' }
  | { readonly name: 'stats' }
  | { readonly name: 'family' }
  | { readonly name: 'friends' }
  | { readonly name: 'optimizer' }
  | { readonly name: 'chat'; readonly with?: { readonly userId: string; readonly displayName: string | null; readonly email: string } }
  | { readonly name: 'achievements' }
  | { readonly name: 'benchmark' }
  | { readonly name: 'account' }
  | { readonly name: 'planned'; readonly module: PlannedModule };

export function App({ initialLocale }: { readonly initialLocale?: 'pt-BR' | 'en' } = {}): ReactNode {
  const [route, setRoute] = useState<Route>({ name: 'home' });
  const [history, setHistory] = useState<readonly Route[]>([]);
  const [search, setSearch] = useState('');

  /** Navega empurrando a rota actual para o histórico. */
  const navigate = useCallback(
    (next: Route) => {
      setRoute((current) => {
        setHistory((entries) => [...entries, current]);
        return next;
      });
    },
    [],
  );

  const goBack = useCallback(() => {
    setHistory((entries) => {
      const previous = entries[entries.length - 1];
      if (previous !== undefined) {
        setRoute(previous);
      }
      return entries.slice(0, -1);
    });
  }, []);

  const onNavigate = useCallback(
    (target: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'optimizer' | 'chat' | 'achievements' | 'benchmark' | 'account') => {
      navigate({ name: target });
    },
    [navigate],
  );

  return (
    <InterfaceProvider initialLocale={initialLocale}>
      <Preferences />
      <AuthProvider>
        <Shell route={route} history={history} search={search} setSearch={setSearch} navigate={navigate} goBack={goBack} onNavigate={onNavigate} />
      </AuthProvider>
    </InterfaceProvider>
  );
}

/** Aplica as preferências ao documento (antes do primeiro desenho). */
function Preferences(): ReactNode {
  useDocumentPreferences();
  return null;
}

/** A estrutura com o conteúdo da rota actual. */
function Shell({
  route,
  history,
  search,
  setSearch,
  navigate,
  goBack,
  onNavigate,
}: {
  readonly route: Route;
  readonly history: readonly Route[];
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly navigate: (route: Route) => void;
  readonly goBack: () => void;
  readonly onNavigate: (target: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'optimizer' | 'chat' | 'achievements' | 'benchmark' | 'account') => void;
}): ReactNode {
  const { t } = useInterface();
  const library = useLibraryForSearch();

  const title = routeTitle(route, t);
  const onSelectGame = useCallback((gameId: string) => navigate({ name: 'details', gameId }), [navigate]);

  const onPlay = useCallback(
    async (gameId: string) => {
      const target = (library.value ?? []).find((game) => game.externalKey === gameId);
      if (target === undefined) {
        return;
      }
      const result = await library.launch(target.id);
      void result;
    },
    [library],
  );

  const onToggleFavorite = useCallback(
    (gameId: string) => {
      const target = (library.value ?? []).find((game) => game.externalKey === gameId);
      if (target !== undefined) {
        void library.toggleFavorite(target.id);
      }
    },
    [library],
  );

  return (
    <AppShell
      route={route}
      title={title}
      canGoBack={history.length > 0}
      search={search}
      onSearch={setSearch}
      onBack={goBack}
      onNavigate={onNavigate}
      onSelectGame={onSelectGame}
    >
      {route.name === 'home' ? (
        <HomePage onOpenGame={onSelectGame} onPlay={onPlay} onToggleFavorite={onToggleFavorite} />
      ) : null}
      {route.name === 'library' ? (
        <LibraryPage search={search} onOpenGame={onSelectGame} onPlay={onPlay} onToggleFavorite={onToggleFavorite} />
      ) : null}
      {route.name === 'details' ? <GameDetailPage gameId={route.gameId} onBack={goBack} /> : null}
      {route.name === 'downloads' ? <DownloadsPage /> : null}
      {route.name === 'settings' ? <SettingsPage /> : null}
      {route.name === 'store' ? <StorePage /> : null}
      {route.name === 'stats' ? <StatsPage /> : null}
      {route.name === 'family' ? <FamilyPage /> : null}
      {route.name === 'friends' ? (
        <FriendsPage
          onMessage={(friend) =>
            navigate({
              name: 'chat',
              with: {
                userId: friend.userId,
                displayName: friend.displayName,
                email: friend.email ?? '',
              },
            })
          }
        />
      ) : null}
      {route.name === 'optimizer' ? <OptimizerPage /> : null}
      {route.name === 'chat' ? <ChatPage conversationWith={route.with} /> : null}
      {route.name === 'achievements' ? <AchievementsPage /> : null}
      {route.name === 'benchmark' ? <BenchmarkPage /> : null}
      {route.name === 'account' ? (
          <LoginPage
            onSkip={() => {
              // Sem session e sem histórico: continuar sem conta leva à
              // Biblioteca — a rota onde a biblioteca local vive.
              navigate({ name: 'library' });
            }}
          />
        ) : null}
      {route.name === 'planned' ? <PlannedPage module={route.module} /> : null}
    </AppShell>
  );
}

/** Título da página actual (traduzido). */
function routeTitle(route: Route, t: Translator): string {
  switch (route.name) {
    case 'home':
      return t('nav.home');
    case 'library':
      return t('nav.library');
    case 'details':
      return t('details.title');
    case 'downloads':
      return t('nav.downloads');
    case 'settings':
      return t('nav.settings');
    case 'store':
      return t('nav.store');
    case 'stats':
      return t('nav.stats');
    case 'family':
      return t('nav.family');
    case 'friends':
      return t('nav.friends');
    case 'optimizer':
      return t('nav.optimizer');
    case 'chat':
      return t('nav.chat');
    case 'achievements':
      return t('nav.achievements');
    case 'benchmark':
      return t('nav.benchmark');
    case 'account':
      return t('auth.title');
    default:
      return t('planned.title');
  }
}

/**
 * Ponte de pesquisa: a página de biblioteca filtra pelo mesmo texto do
 * cabeçalho — uma pesquisa, um sítio.
 */
function useLibraryForSearch(): {
  readonly value: readonly DesktopGameView[] | null;
  readonly toggleFavorite: (id: string) => Promise<void>;
  readonly launch: (id: string) => Promise<{ ok: boolean; reasonKey?: string }>;
} {
  const library = useLibrary();
  const runner = useRunner();
  return useMemo(
    () => ({
      value: library.value,
      toggleFavorite: library.toggleFavorite,
      launch: runner.launch,
    }),
    [library.value, library.toggleFavorite, runner.launch],
  );
}