import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';

/**
 * Saves na nuvem — o progresso com a conta, nos dois sentidos.
 *
 * Sem sessão, o cartão diz o que falta (entrar na conta) em vez de fingir uma
 * nuvem que não existe. Com sessão: as versões **locais** (as que existem no
 * disco) e as **da nuvem**, e a decisão do motor entre as duas mais recentes
 * — em sincronia, à frente de um lado, ou **divergentes** (aí a escolha é de
 * quem joga, porque dos dois lados há progresso).
 *
 * Duas regras que o cartão respeita: restaurar cria um snapshot local de
 * segurança **antes** (o processo principal garante-o), e enviar leva a
 * revisão e o checksum da cópia local — a nuvem não inventa números.
 */

/** Uma versão de um dos lados. */
interface SaveSide {
  readonly id: string;
  readonly label: string;
  readonly revision: number;
  readonly createdAt: string;
}

/** O que a interface mostra de cada lado. */
interface CloudState {
  readonly local: readonly SaveSide[];
  readonly remote: readonly SaveSide[];
  readonly decision: string | null;
}

export function CloudSavesCard({ gameKey }: { readonly gameKey: string }): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;
  const [state, setState] = useState<CloudState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = accessToken();
    if (api === undefined || token === null) {
      setState(null);
      return;
    }
    const result = await api.saves.cloudStatus(gameKey, token);
    setState(result.ok
      ? { local: result.local ?? [], remote: result.remote ?? [], decision: result.decision ?? null }
      : null);
  }, [api, gameKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<{ readonly ok: boolean; readonly message?: string }>, success: string) => {
      const token = accessToken();
      if (api === undefined || token === null) {
        setMessage(t('cloud.login'));
        return;
      }
      const result = await action();
      setMessage(result.ok ? success : (result.message ?? t('cloud.failed')));
      if (result.ok) {
        await reload();
      }
    },
    [api, reload, t],
  );

  const token = accessToken();

  const decisionLabel = state?.decision === null
    ? null
    : state?.decision === 'in-sync'
      ? t('cloud.inSync')
      : state?.decision === 'local-ahead'
        ? t('cloud.localAhead')
        : state?.decision === 'remote-ahead'
          ? t('cloud.remoteAhead')
          : state?.decision === 'diverged'
            ? t('cloud.diverged')
            : null;

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('cloud.title')}</strong>
          {decisionLabel === null ? null : <Badge tone="planned">{decisionLabel}</Badge>}
        </div>

        {token === null ? (
          <p className="nx-subtitle">{t('cloud.login')}</p>
        ) : (
          <>
            <strong className="nx-subtitle">{t('cloud.localSide')}</strong>
            {state === null ? (
              <p className="nx-subtitle">{t('common.loading')}</p>
            ) : state.local.length === 0 ? (
              <p className="nx-subtitle">{t('cloud.localEmpty')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
                {state.local.map((item) => (
                  <li key={item.id} className="hub-row hub-row--between">
                    <span className="hub-break">
                      #{item.revision} · {item.label}
                    </span>
                    <Button
                      onClick={() => {
                        void run(
                          () => (api === undefined ? Promise.resolve({ ok: false }) : api.saves.cloudUpload(gameKey, item.id, token)).then(
                            (result) => result,
                          ),
                          t('cloud.uploaded', { revision: item.revision }),
                        );
                      }}
                    >
                      {t('cloud.upload')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <strong className="nx-subtitle">{t('cloud.remoteSide')}</strong>
            {state === null ? null : state.remote.length === 0 ? (
              <p className="nx-subtitle">{t('cloud.remoteEmpty')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.35rem' }}>
                {state.remote.map((item) => (
                  <li key={item.id} className="hub-row hub-row--between">
                    <span className="hub-break">
                      #{item.revision} · {item.label} · {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}
                    </span>
                    <span className="hub-row">
                      <Button
                        onClick={() => {
                          void run(
                            () => (api === undefined ? Promise.resolve({ ok: false }) : api.saves.cloudRestore(gameKey, item.id, token)).then(
                              (result) => result,
                            ),
                            t('cloud.restored', { revision: item.revision }),
                          );
                        }}
                      >
                        {t('cloud.restore')}
                      </Button>
                      <Button
                        onClick={() => {
                          void run(
                            () => (api === undefined ? Promise.resolve({ ok: false }) : api.saves.cloudDelete(item.id, token)).then(
                              (result) => result,
                            ),
                            t('cloud.deleted'),
                          );
                        }}
                      >
                        {t('cloud.delete')}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="nx-subtitle">{t('cloud.hint')}</p>
          </>
        )}

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      </div>
    </Card>
  );
}