import { useState, type ReactNode } from 'react';
import { InterfaceProvider, useDocumentPreferences } from '@nexora/ui';
import { AppShell } from './components/AppShell.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { GameDetailPage } from './pages/GameDetailPage.js';
import { DownloadsPage } from './pages/DownloadsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { PlannedPage } from './pages/PlannedPage.js';

/**
 * Aplicação do launcher.
 *
 * A navegação é um estado simples — o esquema interno serve o `index.html`
 * para qualquer caminho (fallback SPA), e nenhuma rota depende do histórico
 * do browser. Módulos que ainda não existem aparecem com selo "Planeado".
 */

/** Módulos planeados (só tipos nesta fase). */
export type PlannedModule = 'downloads' | 'cloudSaves' | 'friends';

/** Rota activa. */
export type Route =
  | { readonly name: 'library' }
  | { readonly name: 'details'; readonly gameId: string }
  | { readonly name: 'downloads' }
  | { readonly name: 'settings' }
  | { readonly name: 'planned'; readonly module: PlannedModule };

export function App({ initialLocale }: { readonly initialLocale?: 'pt-BR' | 'en' } = {}): ReactNode {
  const [route, setRoute] = useState<Route>({ name: 'library' });

  return (
    <InterfaceProvider initialLocale={initialLocale}>
      <Preferences />
      <AppShell route={route} onNavigate={setRoute}>
        {route.name === 'library' ? (
          <LibraryPage
            onOpenGame={(gameId) => {
              setRoute({ name: 'details', gameId });
            }}
          />
        ) : null}
        {route.name === 'details' ? <GameDetailPage gameId={route.gameId} onBack={() => setRoute({ name: 'library' })} /> : null}
        {route.name === 'downloads' ? <DownloadsPage /> : null}
        {route.name === 'settings' ? <SettingsPage /> : null}
        {route.name === 'planned' ? <PlannedPage module={route.module} /> : null}
      </AppShell>
    </InterfaceProvider>
  );
}

/** Aplica as preferências ao documento (antes do primeiro desenho). */
function Preferences(): ReactNode {
  useDocumentPreferences();
  return null;
}