import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import * as api from '../api/library.js';
import { clearSession, storeTokens } from '../api/client.js';

/**
 * Contexto de autenticação da web.
 *
 * O token vive no `sessionStorage` (nunca no `localStorage`) — uma sessão de
 * navegador fechada não deixa credencial para trás. O estado do utilizador é
 * resolvido a partir de `/me`, nunca guardado em disco.
 */

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: string;
  planId: string;
  mfaEnabled: boolean;
}

interface AuthState {
  readonly user: AuthUser | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly login: (
    email: string,
    password: string,
  ) => Promise<{ kind: 'authenticated' } | { kind: 'mfa_required'; challengeToken: string }>;
  readonly register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  readonly verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    const response = await api.me();
    setUser(response.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.login({ email, password });
        if (result.kind === 'mfa_required') {
          // O desafio fica no estado do contexto — é temporário e expira em
          // 5 minutos. Nunca no `sessionStorage`.
          return { kind: 'mfa_required' as const, challengeToken: result.challenge.challengeToken };
        }
        storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
        await loadMe();
        return { kind: 'authenticated' as const };
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao entrar.');
        throw cause;
      } finally {
        setLoading(false);
      }
    },
    [loadMe],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.register(input);
        storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
        await loadMe();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao registar.');
        throw cause;
      } finally {
        setLoading(false);
      }
    },
    [loadMe],
  );

  const verifyMfa = useCallback(
    async (challengeToken: string, code: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await api.verifyMfa({ challengeToken, code });
        storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
        await loadMe();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Falha ao verificar.');
        throw cause;
      } finally {
        setLoading(false);
      }
    },
    [loadMe],
  );

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, error, login, register, verifyMfa, logout }),
    [user, loading, error, login, register, verifyMfa, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Acesso ao contexto de autenticação. */
export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth tem de ser usado dentro de AuthProvider.');
  }
  return value;
}