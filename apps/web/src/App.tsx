import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { InterfaceProvider, useDocumentPreferences } from '@nexora/ui';
import { AuthProvider, useAuth } from './auth/AuthContext.js';
import { AppShell } from './components/AppShell.js';
import { LoginPage } from './pages/LoginPage.js';
import { LibraryPage } from './pages/LibraryPage.js';
import { AdminPage } from './pages/AdminPage.js';
import { NotFoundPage } from './pages/NotFoundPage.js';
import { accessToken } from './api/client.js';

/**
 * Rotas da web.
 *
 * A biblioteca é **leitura**: exige sessão, mas não escreve nada no sistema do
 * utilizador. O painel administrativo é um esqueleto com a guarda do lado do
 * servidor.
 */
export function App({ initialLocale }: { readonly initialLocale?: 'pt-BR' | 'en' } = {}): ReactNode {
  return (
    <InterfaceProvider initialLocale={initialLocale}>
      <Preferences />
      <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<Navigate replace to="/biblioteca" />} />
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/biblioteca"
              element={
                <RequireAuth>
                  <LibraryPage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </InterfaceProvider>
  );
}

/** Aplica as preferências de interface ao documento (antes do primeiro desenho). */
function Preferences(): ReactNode {
  useDocumentPreferences();
  return null;
}

/** Exige sessão: sem token, a rota manda para o login. */
function RequireAuth({ children }: { readonly children: ReactNode }): ReactNode {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null && accessToken() === null) {
    return <Navigate replace to="/login" state={{ from: location.pathname }} />;
  }
  return children;
}