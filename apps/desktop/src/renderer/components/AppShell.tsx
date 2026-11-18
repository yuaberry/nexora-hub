import type { ReactNode } from 'react';
import { Sidebar, ThemeSwitch, useInterface, type SidebarItem } from '@nexora/ui';
import { useIsDesktop } from '../state/desktop.js';
import type { PlannedModule, Route } from '../App.js';

/**
 * Estrutura do launcher — barra lateral e alternador de tema no canto
 * superior esquerdo (a animação vive no CSS e respeita "reduzir movimento").
 *
 * Os módulos que ainda não existem aparecem na barra com o selo "Planeado":
 * clicar leva a uma página que explica o que falta, nunca a um botão que
 * finge funcionar.
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

  const items: readonly SidebarItem[] = [
    { id: 'library', label: t('nav.library') },
    { id: 'settings', label: t('nav.settings') },
    { id: 'downloads', label: t('nav.downloads'), planned: true },
    { id: 'cloudSaves', label: t('nav.cloudSaves'), planned: true },
    { id: 'friends', label: t('nav.friends'), planned: true },
  ];

  const activeId = route.name === 'details' ? 'library' : route.name === 'planned' ? route.module : route.name;

  function onSelect(id: string): void {
    if (id === 'library' || id === 'settings') {
      onNavigate({ name: id });
      return;
    }
    if (id === 'downloads' || id === 'cloudSaves' || id === 'friends') {
      onNavigate({ name: 'planned', module: id satisfies PlannedModule });
    }
  }

  return (
    <div className="hub-shell">
      <Sidebar
        title={t('common.app.name')}
        items={items}
        activeId={activeId}
        onSelect={onSelect}
        plannedLabel={t('planned.badge')}
        footer={
          <span className="nx-subtitle hub-break">
            {isDesktop ? t('common.desktopBadge') : t('common.desktopOnly')}
          </span>
        }
      />
      <div className="hub-main">
        <header
          className="nx-row nx-row--between"
          style={{
            padding: '0.75rem 1.25rem',
            borderBottom: '1px solid var(--paper-line)',
            background: 'var(--paper-surface)',
          }}
        >
          <div className="nx-row">
            <ThemeSwitch
              theme={appliedTheme}
              onToggle={toggleTheme}
              label={t('settings.theme.label')}
              lightLabel={t('settings.theme.light')}
              darkLabel={t('settings.theme.dark')}
            />
            <strong className="hub-break">{t('common.app.tagline')}</strong>
          </div>
        </header>
        <main className="hub-content">{children}</main>
      </div>
    </div>
  );
}