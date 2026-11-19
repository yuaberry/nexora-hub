import type { ReactNode } from 'react';
import { Badge, ThemeSwitch, useInterface } from '@nexora/ui';
import { useIsDesktop } from '../state/desktop.js';
import type { Route } from '../App.js';

/**
 * Estrutura do launcher — barra superior, estilo launcher de jogos.
 *
 * A marca à esquerda, a navegação ao centro, o alternador de tema animado e o
 * selo do executável à direita. O alternador fica visível em qualquer página,
 * e a animação respeita "reduzir movimento" (o CSS encarrega-se disso).
 *
 * Os módulos que ainda não existem aparecem numa linha "Em breve" dentro da
 * biblioteca — não ocupam a navegação principal como se existissem.
 */
export function AppShell({
  route,
  onNavigate,
  children,
}: {
  readonly route: Route;
  readonly onNavigate: (route: Route) => void;
  readonly children: ReactNode;
}): ReactNode {
  const { t, appliedTheme, toggleTheme } = useInterface();
  const isDesktop = useIsDesktop();

  const items: readonly { readonly id: 'library' | 'downloads' | 'settings'; readonly label: string }[] = [
    { id: 'library', label: t('nav.library') },
    { id: 'downloads', label: t('nav.downloads') },
    { id: 'settings', label: t('nav.settings') },
  ];

  const activeId = route.name === 'details' ? 'library' : route.name;

  return (
    <div>
      <header className="hub-topbar">
        <div className="hub-brand">
          <span className="hub-brand__mark" aria-hidden="true">NX</span>
          <span className="hub-brand__name">{t('common.app.name')}</span>
        </div>

        <nav className="hub-nav" aria-label={t('common.app.name')}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`hub-nav__item${item.id === activeId ? ' hub-nav__item--active' : ''}`}
              aria-current={item.id === activeId ? 'page' : undefined}
              onClick={() => {
                if (item.id === 'library' || item.id === 'downloads' || item.id === 'settings') {
                  onNavigate({ name: item.id });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="hub-topbar__right">
          <span className="nx-subtitle">{t('common.app.tagline')}</span>
          <ThemeSwitch
            theme={appliedTheme}
            onToggle={toggleTheme}
            label={t('settings.theme.label')}
            lightLabel={t('settings.theme.light')}
            darkLabel={t('settings.theme.dark')}
          />
          <Badge>{isDesktop ? t('common.desktopBadge') : t('common.desktopOnly')}</Badge>
        </div>
      </header>

      <main className="hub-content">{children}</main>
    </div>
  );
}