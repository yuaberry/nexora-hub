/**
 * Estado do desktop — a fronteira com o processo principal.
 *
 * Nenhum hook aqui toca em ficheiros: tudo passa por `window.nexora`, tipado
 * em `shared/preload-api.ts`. No browser (a web) a API não existe e os hooks
 * devolvem o estado vazio com o motivo — nunca fingem uma biblioteca local.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type {
  AppInfoView,
  DesktopApi,
  DesktopGameView,
  DetectedFolderView,
  DiskUsageView,
  ImportResultView,
  LaunchResultView,
  SessionSummaryView,
} from '../../shared/preload-api.js';
import { isDesktopRuntime } from '../../shared/preload-api.js';

/** A API do desktop, ou `null` no browser. */
export function desktopApi(): DesktopApi | null {
  return globalThis.window?.nexora ?? null;
}

/** `true` quando o código corre no executável. */
export function useIsDesktop(): boolean {
  return isDesktopRuntime();
}

interface AsyncState<T> {
  readonly value: T | null;
  readonly loading: boolean;
  readonly error: string | null;
}

function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> & { readonly reload: () => void } {
  const [value, setValue] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    load()
      .then((result) => {
        setValue(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Falha inesperada.');
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { value, loading, error, reload };
}

/** Biblioteca local do launcher. */
export function useLibrary(): AsyncState<readonly DesktopGameView[]> & {
  readonly reload: () => void;
  readonly importFolder: () => Promise<ImportResultView | null>;
  readonly detectFolders: () => Promise<readonly DetectedFolderView[]>;
  readonly toggleFavorite: (id: string) => Promise<void>;
  readonly remove: (id: string) => Promise<void>;
} {
  const api = desktopApi();
  const state = useAsync<readonly DesktopGameView[]>(
    () => api?.library.list() ?? Promise.resolve([]),
    [api],
  );

  const importFolder = useCallback(async () => {
    if (api === null) {
      return null;
    }
    const result = await api.library.importFolder();
    state.reload();
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, state.reload]);

  const detectFolders = useCallback(async () => {
    if (api === null) {
      return [];
    }
    return api.library.detectFolders();
  }, [api]);

  const toggleFavorite = useCallback(
    async (id: string) => {
      await api?.library.toggleFavorite(id);
      state.reload();
    },
    [api, state.reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api?.library.remove(id);
      state.reload();
    },
    [api, state.reload],
  );

  return { ...state, importFolder, detectFolders, toggleFavorite, remove };
}

/** Estado do runner (sessões em curso + acções). */
export interface RunnerState extends AsyncState<readonly SessionSummaryView[]> {
  readonly launch: (id: string) => Promise<LaunchResultView>;
  readonly stop: (sessionId: string) => Promise<void>;
}

/** Runner: lançar, parar e listar sessões em curso. */
export function useRunner(): RunnerState {
  const api = desktopApi();
  const state = useAsync<readonly SessionSummaryView[]>(
    () => api?.runner.running() ?? Promise.resolve([]),
    [api],
  );

  const launch = useCallback(
    async (id: string) => {
      if (api === null) {
        return { ok: false as const, reasonKey: 'no-runner' as const };
      }
      const result = await api.runner.launch(id);
      void state.reload();
      return result;
    },
    [api, state.reload],
  );

  const stop = useCallback(
    async (sessionId: string) => {
      await api?.runner.stop(sessionId);
      await state.reload();
    },
    [api, state.reload],
  );

  return { ...state, launch, stop };
}

/** Uso de disco do volume dos jogos. */
export function useDiskUsage(): AsyncState<DiskUsageView> & { readonly reload: () => void } {
  const api = desktopApi();
  return useAsync<DiskUsageView>(
    () => api?.storage.usage() ?? Promise.resolve({ totalBytes: 0, freeBytes: 0, gamesBytes: 0 }),
    [api],
  );
}

/** Diagnóstico do executável (plataforma e versões — nunca inventadas). */
export function useAppInfo(): AsyncState<AppInfoView> & { readonly reload: () => void } {
  const api = desktopApi();
  return useAsync<AppInfoView>(
    () => api?.app() ?? Promise.resolve({ platform: 'web', versions: { app: '-', electron: '-', chrome: '-', node: '-' }, desktop: false }),
    [api],
  );
}

/** Componente de erro mínima (evita repetir o padrão em cada página). */
export function ErrorNote({ message, retry }: { readonly message: string; readonly retry?: () => void }): ReactNode {
  return (
    <div className="nx-banner">
      <span>{message}</span>
      {retry === undefined ? null : (
        <button type="button" className="nx-button" onClick={retry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}