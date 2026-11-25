import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, TextInput, useInterface } from '@nexora/ui';
import { isHostAddress } from '@nexora/core';

/**
 * Remote Play — o Moonlight do sistema, encaminhado.
 *
 * O NEXORA HUB não faz *streaming*: quem sabe é o **Moonlight**, binário do
 * sistema. Esta página detecta-o, emparelha com um anfitrião (um PC com
 * Sunshine ou GeForce Experience), lista os jogos que ele tem e joga-os pelo
 * Moonlight.
 *
 * Sem o binário, a página diz o que falta e aponta o caminho — nenhum botão
 * finge um *stream* que não pode começar. Quando o Moonlight estiver
 * instalado, tudo aqui passa a funcionar sem uma única linha nova.
 */

/** Um jogo do anfitrião (a lista do Moonlight). */
interface RemoteApp {
  readonly index: number;
  readonly title: string;
}

export function RemotePlayPage(): ReactNode {
  const { t } = useInterface();
  const api = globalThis.window?.nexora;

  const [binary, setBinary] = useState<string | null | undefined>(undefined);
  const [host, setHost] = useState('');
  const [apps, setApps] = useState<readonly RemoteApp[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (api === undefined) {
      return;
    }
    void api.remotePlay.detect().then((result) => {
      setBinary(result.binary);
    });
  }, [api]);

  const onPair = useCallback(async () => {
    if (api === undefined || !isHostAddress(host)) {
      return;
    }
    const result = await api.remotePlay.pair(host.trim());
    setMessage(result.ok ? t('remotePlay.paired') : t('remotePlay.pairFailed'));
  }, [api, host, t]);

  const onList = useCallback(async () => {
    if (api === undefined || !isHostAddress(host)) {
      return;
    }
    setMessage(null);
    const result = await api.remotePlay.apps(host.trim());
    setApps(result.ok ? result.items ?? [] : null);
    if (!result.ok) {
      setMessage(t('remotePlay.listFailed'));
    }
  }, [api, host, t]);

  if (binary === undefined) {
    return <p className="nx-subtitle">{t('common.loading')}</p>;
  }

  if (binary === null) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('remotePlay.title')}</h1>
        <EmptyState title={t('remotePlay.missing.title')} hint={t('remotePlay.missing.hint')} />
      </div>
    );
  }

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <h1 className="nx-title">{t('remotePlay.title')}</h1>
        <Badge tone="positive">{binary}</Badge>
      </div>

      <Card>
        <div className="nx-stack">
          <TextInput
            label={t('remotePlay.host')}
            placeholder={t('remotePlay.host.placeholder')}
            hint={t('remotePlay.host.hint')}
            value={host}
            onChange={(event) => setHost(event.target.value)}
          />
          <div className="hub-row">
            <Button onClick={() => void onPair()} disabled={!isHostAddress(host)}>
              {t('remotePlay.pair')}
            </Button>
            <Button variant="primary" onClick={() => void onList()} disabled={!isHostAddress(host)}>
              {t('remotePlay.list')}
            </Button>
          </div>
          {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
        </div>
      </Card>

      {apps === null ? null : (
        <Card>
          <div className="nx-stack">
            <strong>{t('remotePlay.apps')}</strong>
            {apps.length === 0 ? (
              <p className="nx-subtitle">{t('remotePlay.appsEmpty')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                {apps.map((app) => (
                  <li key={app.index} className="hub-row hub-row--between">
                    <span className="hub-break">{app.title}</span>
                    <Button
                      onClick={() => {
                        if (api !== undefined && isHostAddress(host)) {
                          void api.remotePlay.stream(host.trim(), app.index);
                        }
                      }}
                    >
                      {t('remotePlay.play')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}