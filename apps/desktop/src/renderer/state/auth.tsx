import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { PublicUser } from '@nexora/protocol';
import { accessToken, apiRequest, clearSession, storeTokens } from '../lib/api.js';

/**
 * Contexto de autenticação do launcher.
 *
 * A conta é opcional para a biblioteca local (jogar, pesquisar, medir tempo,
 * snapshots funcionam sem conta) e **obrigatória** para o que é social
 * (comentar, reviewar, amigos no futuro). O token vive no `sessionStorage`
 * — nunca no `localStorage`: uma sessão fechada não deixa credencial.
 *
 * A troca de contas é explícita: `switchAccount` limpa a sessão e volta ao
 * ecrã de entrada, sem fechar o launcher — a biblioteca local é do
 * computador, não da conta.
 */

/** O que o contexto expõe. */
interface AuthState {
  /** Utilizador em sessão, ou `null`. */
  readonly user: PublicUser | null;
  /** `true` enquanto o estado inicial está a ser resolvido. */
  readonly loading: boolean;
  /** Resultado do login: sessão aberta, ou desafio de segundo factor. */
  readonly login: (
    email: string,
    password: string,
  ) => Promise<{ kind: 'authenticated' } | { kind: 'mfa_required'; challengeToken: string }>;
  readonly register: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  readonly verifyMfa: (challengeToken: string, code: string) => Promise<void>;
  /** Troca de conta: limpa a sessão e volta à entrada. */
  readonly switchAccount: () => void;
  readonly logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Forma da resposta de `/auth/login`. */
type LoginResult =
  | { kind: 'authenticated'; user: PublicUser; tokens: { accessToken: string; refreshToken: string } }
  | { kind: 'mfa_required'; challenge: { challengeToken: string; expiresIn: number }; user: PublicUser };

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactNode {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(accessToken() !== null);

  /** Resolve o utilizador a partir de `/me` (nunca guardado em disco). */
  const loadMe = useCallback(async () => {
    try {
      const response = await apiRequest<{ user: PublicUser }>('/api/v1/me');
      setUser(response.user);
    } catch {
      clearSession();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await apiRequest<LoginResult>('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password },
        auth: false,
      });
      if (result.kind === 'mfa_required') {
        // O desafio fica no estado do contexto — é temporário e expira em
        // 5 minutos. Nunca no `sessionStorage`.
        return { kind: 'mfa_required' as const, challengeToken: result.challenge.challengeToken };
      }
      storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
      setUser(result.user);
      return { kind: 'authenticated' as const };
    },
    [],
  );

  const register = useCallback(
    async (input: { email: string; password: string; displayName: string }) => {
      const result = await apiRequest<{ user: PublicUser; tokens: { accessToken: string; refreshToken: string } }>(
        '/api/v1/auth/register',
        { method: 'POST', body: input, auth: false },
      );
      storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
      setUser(result.user);
    },
    [],
  );

  const verifyMfa = useCallback(async (challengeToken: string, code: string) => {
    const result = await apiRequest<{ user: PublicUser; tokens: { accessToken: string; refreshToken: string } }>(
      '/api/v1/auth/mfa/verify',
      { method: 'POST', body: { challengeToken, code }, auth: false },
    );
    storeTokens(result.tokens.accessToken, result.tokens.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const switchAccount = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, verifyMfa, switchAccount, logout }),
    [user, loading, login, register, verifyMfa, switchAccount, logout],
  );

  // Resolve o utilizador no arranque, quando há token na sessão.
  useEffect(() => {
    if (accessToken() !== null) {
      void loadMe();
    }
  }, [loadMe]);

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