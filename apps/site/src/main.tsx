import { StrictMode } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { InterfaceProvider, useDocumentPreferences } from '@nexora/ui';
import { SiteI18nProvider } from './i18n/SiteI18n.js';
import { SiteHeader, SiteFooter } from './components/SiteHeader.js';
import { LandingPage } from './pages/LandingPage.js';
import { DownloadsPage } from './pages/DownloadsPage.js';
import { DocsPage } from './pages/DocsPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import './index.css';

/**
 * Ponto de entrada do site.
 *
 * O tema (claro/escuro) é preferência do **dispositivo**, como no launcher:
 * o `InterfaceProvider` aplica os tokens de papel em `useLayoutEffect`, antes
 * do primeiro desenho, e sem *script inline* (a CSP do site proíbe).
 */
function Preferences(): ReactNode {
  useDocumentPreferences();
  return null;
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Elemento #root não encontrado.');
}

createRoot(container).render(
  <StrictMode>
    <InterfaceProvider>
      <Preferences />
      <SiteI18nProvider>
        <BrowserRouter>
          <div className="site">
            <SiteHeader />
            <main className="site-main">
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/descarregar" element={<DownloadsPage />} />
                <Route path="/documentacao" element={<DocsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
            <SiteFooter />
          </div>
        </BrowserRouter>
      </SiteI18nProvider>
    </InterfaceProvider>
  </StrictMode>,
);