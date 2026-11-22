import { useCallback, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import type { SteamAppSummary } from '@nexora/core';
import { coverFit, coverUrl } from '../lib/media.js';
import { GameImage } from './GameImage.js';
import { useLibrary } from '../state/desktop.js';

/**
 * Descobrir — procurar um jogo pelo nome ou pelo AppID e guardá-lo na
 * biblioteca **como metadado**.
 *
 * A NEXORA não vende nem hospedeia jogos: o que este painel faz é perguntar
 * à loja pública quem é um jogo e trazer o título, a capa e o link para a
 * biblioteca local. A instalação continua a ser da loja oficial — uma entrada
 * nova fica marcada como "não instalada", e a página do jogo mostra o caminho
 * certo (o link da loja) em vez de um botão que não arranca nada.
 */
export function DiscoverPanel(): ReactNode {
  const { t } = useInterface();
  const api = globalThis.window?.nexora;
  const library = useLibrary();

  const [term, setTerm] = useState('');
  const [appId, setAppId] = useState('');
  const [results, setResults] = useState<readonly SteamAppSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSearch = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    setBusy(true);
    const result = await api.steam.search(term);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message ?? t('catalog.failed'));
      setResults([]);
      return;
    }
    setResults(result.items ?? []);
    setMessage(null);
  }, [api, term, t]);

  const onAdd = useCallback(
    async (app: SteamAppSummary) => {
      if (api === undefined) {
        return;
      }
      const result = await api.library.addCatalog(app.appId);
      if (!result.ok) {
        setMessage(result.message ?? t('catalog.failed'));
        return;
      }
      setMessage(
        result.duplicate === true
          ? t('catalog.duplicate', { title: result.title ?? app.title })
          : t('catalog.added', { title: result.title ?? app.title }),
      );
      library.reload();
    },
    [api, library, t],
  );

  return (
    <Card>
      <div className="nx-stack">
        <strong>{t('catalog.title')}</strong>
        <p className="nx-subtitle">{t('catalog.hint')}</p>

        <div className="hub-row">
          <input
            className="nx-input"
            value={term}
            placeholder={t('catalog.search.placeholder')}
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void onSearch();
              }
            }}
          />
          <Button onClick={() => void onSearch()} disabled={busy}>
            {t('catalog.search')}
          </Button>
        </div>

        <div className="hub-row">
          <input
            className="nx-input"
            value={appId}
            placeholder={t('catalog.appId.placeholder')}
            inputMode="numeric"
            onChange={(event) => setAppId(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void api?.steam.lookup(appId).then((result) => {
                  setResults(result.ok && result.app !== undefined ? [result.app] : []);
                  if (!result.ok) {
                    setMessage(result.message ?? t('catalog.failed'));
                  }
                });
              }
            }}
          />
          <Button
            onClick={() => {
              void api?.steam.lookup(appId).then((result) => {
                setResults(result.ok && result.app !== undefined ? [result.app] : []);
                if (!result.ok) {
                  setMessage(result.message ?? t('catalog.failed'));
                }
              });
            }}
            disabled={busy || appId === ''}
          >
            {t('catalog.lookup')}
          </Button>
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        {results === null || results.length === 0 ? null : (
          <>
            <strong>{t('catalog.results')}</strong>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {results.map((app) => (
                <li key={app.appId} className="hub-row hub-row--between">
                  <span className="hub-row" style={{ minWidth: 0 }}>
                    <span className="nx-cover" style={{ width: '4rem', height: '2.4rem', flex: '0 0 auto' }}>
                      <GameImage
                        src={coverUrl(app.coverUrl)}
                        fit={coverFit(app.coverUrl)}
                        alt=""
                        fallback={<span style={{ fontSize: '0.75rem' }}>{app.title.slice(0, 1).toUpperCase()}</span>}
                      />
                    </span>
                    <span className="hub-break">{app.title}</span>
                    <Badge tone={app.free ? 'positive' : 'neutral'}>
                      {app.free ? t('catalog.free') : t('catalog.paid')}
                    </Badge>
                    <Badge tone="neutral">{app.appId}</Badge>
                  </span>
                  <Button onClick={() => void onAdd(app)}>{t('catalog.add')}</Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}