import type { ReactNode } from 'react';
import { Button, ThemeSwitch, useInterface } from '@nexora/ui';
import { Sidebar } from './Sidebar.js';
import type { Route } from '../App.js';

/**
 * Estrutura do launcher — barra lateral + cabeçalho.
 *
 * Inspirada no gesto dos launchers modernos (biblioteca sempre ao alcance,
 * pesquisa no topo), mas com a identidade da NEXORA: marca própria, tokens de
 * papel, e o botão de voltar que funciona de verdade (histórico real de
 * navegação, não um adorno).
 *
 * O alternador de tema animado vive no cabeçalho, à direita da pesquisa.
 */
export function AppShell({
  route,
  title,
  canGoBack,
  search,
  onSearch,
  onBack,
  onNavigate,
  onSelectGame,
  children,
}: {
  readonly route: Route;
  /** Título da página actual (traduzido pelo chamador). */
  readonly title: string;
  readonly canGoBack: boolean;
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly onBack: () => void;
  readonly onNavigate: (target: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'optimizer' | 'chat' | 'achievements' | 'account') => void;
  readonly onSelectGame: (gameId: string) => void;
  readonly children: ReactNode;
}): ReactNode {
  const { t, appliedTheme, toggleTheme } = useInterface();

  const activeGameId = route.name === 'details' ? route.gameId : null;
  // A rota da barra lateral: 'details' ilumina a Biblioteca, e 'planned' não
  // tem entrada própria (os módulos planeados vivem dentro das páginas).
  const shellRoute: 'home' | 'library' | 'downloads' | 'settings' | 'store' | 'stats' | 'family' | 'friends' | 'optimizer' | 'chat' | 'achievements' | 'account' =
    route.name === 'details' ? 'library' : route.name === 'planned' ? 'home' : route.name;

  return (
    <div className="hub-shell">
      <Sidebar
        route={shellRoute}
        activeGameId={activeGameId}
        onNavigate={onNavigate}
        onSelectGame={onSelectGame}
      />

      <div className="hub-content">
        <header className="hub-header">
          <div className="hub-header__left">
            <Button
              onClick={onBack}
              disabled={!canGoBack}
              aria-label={t('common.action.back')}
              title={t('common.action.back')}
            >
              ← {t('common.action.back')}
            </Button>
            <h1 className="hub-header__title">{title}</h1>
          </div>
          <div className="hub-header__left" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <input
              className="nx-input hub-header__search"
              value={search}
              placeholder={t('header.search')}
              aria-label={t('header.search')}
              onChange={(event) => {
                onSearch(event.target.value);
              }}
            />
            <ThemeSwitch
              theme={appliedTheme}
              onToggle={toggleTheme}
              label={t('settings.theme.label')}
              lightLabel={t('settings.theme.light')}
              darkLabel={t('settings.theme.dark')}
            />
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}