import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PlannedBadge, TextInput, useInterface, type Translator } from '@nexora/ui';
import { ErrorNote, useIsDesktop } from '../state/desktop.js';
import type { DownloadTaskView, SourceSearchHit, SourceView } from '../../shared/preload-api.js';

/**
 * Downloads e fontes.
 *
 * A aba era "Planeado" na Fase 1; nesta fase é **real**, com o que existe de
 * facto: motor HTTP multi-conexão com verificação por checksum, fila com
 * prioridade, pausa/retoma, e instalação de manifestos `.json` pelo
 * utilizador.
 *
 * O que continua planeado, e a interface diz-o: cliente de torrent, saves na
 * nuvem, amigos. Nada aqui finge funcionar.
 */
export function DownloadsPage(): ReactNode {
  const { t, locale } = useInterface();
  const isDesktop = useIsDesktop();
  const [sources, setSources] = useState<readonly SourceView[] | null>(null);
  const [tasks, setTasks] = useState<readonly DownloadTaskView[] | null>(null);
  const [extractionErrors, setExtractionErrors] = useState<Readonly<Record<string, string>>>({});
  const [proton, setProton] = useState<Readonly<Record<string, string>>>({});
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<readonly SourceSearchHit[]>([]);
  const [destination, setDestination] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const api = globalThis.window?.nexora;

  const reload = useCallback(async () => {
    if (api === undefined) {
      return;
    }
    try {
      const [sourceList, downloadList] = await Promise.all([api.sources.list(), api.downloads.list()]);
      setSources(sourceList);
      setTasks(downloadList.tasks);
      setExtractionErrors(downloadList.extractionErrors);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('error.generic'));
    }
  }, [api, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // A fila tem um relógio próprio: a interface pergunta o estado a cada
  // segundo em vez de fingir progresso que não foi medido.
  useEffect(() => {
    if (api === undefined) {
      return;
    }
    const timer = setInterval(() => {
      void api.downloads.list().then((list) => {
        setTasks(list.tasks);
        setExtractionErrors(list.extractionErrors);
      });
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [api]);

  const onSearch = useCallback(
    async (value: string) => {
      setQuery(value);
      if (api === undefined || value.trim() === '') {
        setHits([]);
        return;
      }
      const results = await api.sources.search(value, 10);
      setHits(results);
    },
    [api],
  );

  const onDownload = useCallback(
    async (gameId: string) => {
      if (api === undefined) {
        return;
      }
      const result = await api.downloads.add(gameId, destination);
      setMessage(
        result.ok
          ? t('downloads.queued')
          : `${t('downloads.error')}: ${result.message ?? result.code ?? '?'}`,
      );
      await reload();
    },
    [api, destination, reload, t],
  );

  const progressLabel = useMemo(
    () => (task: DownloadTaskView) => {
      const received = task.receivedBytes / 1_000_000;
      const total = task.totalBytes === null ? null : task.totalBytes / 1_000_000;
      const formatter = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
      if (total === null) {
        return `${formatter.format(received)} MB`;
      }
      return `${formatter.format(received)} / ${formatter.format(total)} MB · ${Math.round((received / total) * 100)}%`;
    },
    [locale],
  );

  if (!isDesktop) {
    return <EmptyState title={t('common.desktopOnly')} hint={t('common.desktopOnly')} />;
  }

  return (
    <div className="nx-stack">
      <div className="nx-row nx-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('nav.downloads')}</h1>
          <p className="nx-subtitle">{t('downloads.subtitle')}</p>
        </div>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      {error === null ? null : <ErrorNote message={error} retry={() => void reload()} />}
      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <Card>
        <div className="nx-stack">
          <strong>{t('downloads.sources')}</strong>
          <p className="nx-subtitle">{t('downloads.sources.hint')}</p>
          <div className="hub-row">
            <Button
              onClick={() => {
                if (api === undefined) {
                  return;
                }
                void api.sources.installFile().then((result) => {
                  setMessage(result.ok ? t('downloads.source.installed') : `${t('downloads.error')}: ${result.message ?? ''}`);
                  return reload();
                });
              }}
            >
              {t('downloads.install')}
            </Button>
            <TextInput
              label={t('downloads.destination')}
              value={destination}
              hint={t('downloads.destination.hint')}
              onChange={(event) => {
                setDestination(event.target.value);
              }}
            />
          </div>

          {sources === null || sources.length === 0 ? (
            <EmptyState title={t('downloads.sources.empty')} hint={t('downloads.sources.empty.hint')} />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {sources.map((source) => (
                <li key={source.id} className="nx-row nx-row--between">
                  <span className="nx-stack">
                    <strong>{source.name}</strong>
                    <span className="nx-subtitle hub-break">{source.id} · {source.games} jogos</span>
                    <span className="nx-subtitle hub-break">{source.legal.basis}</span>
                  </span>
                  <div className="nx-row">
                    <Badge>{source.legal.attestedBy}</Badge>
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (api === undefined) {
                          return;
                        }
                        void api.sources.remove(source.id).then(() => reload());
                      }}
                    >
                      {t('common.action.remove')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('downloads.search')}</strong>
          <TextInput
            label={t('library.search.placeholder')}
            value={query}
            hint={t('library.search.hint')}
            onChange={(event) => {
              void onSearch(event.target.value);
            }}
          />
          {hits.length === 0 ? null : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {hits.map((hit) => (
                <li key={hit.id} className="nx-row nx-row--between">
                  <span className="nx-stack">
                    <strong>{hit.title}</strong>
                    <span className="nx-subtitle">{matchLabel(hit.match, t)}</span>
                  </span>
                  <div className="nx-row">
                    {hit.available ? null : <Badge tone="planned">{t('planned.badge')}</Badge>}
                    <Button
                      variant="primary"
                      disabled={!hit.available || destination.trim() === ''}
                      onClick={() => {
                        void onDownload(hit.id);
                      }}
                    >
                      {t('downloads.action')}
                    </Button>
                    <Button
                      disabled={destination.trim() === ''}
                      onClick={() => {
                        if (api === undefined) {
                          return;
                        }
                        // A verificação recalcula os checksums no disco: a
                        // segurança não vem da fonte, vem do ficheiro.
                        void api.downloads.verify(hit.id, destination).then((result) => {
                          setMessage(
                            result.ok
                              ? `${t('downloads.verify')}: ${result.message ?? ''}`
                              : `${t('downloads.verify.failed')}: ${result.message ?? ''}`,
                          );
                        });
                      }}
                    >
                      {t('downloads.verify.action')}
                    </Button>
                    {hit.steamAppId === null ? null : (
                      <Button
                        onClick={() => {
                          if (api === undefined) {
                            return;
                          }
                          // Rating **externo**: mostra valor, data e fonte —
                          // e recusa com motivo quando a ProtonDB não responde.
                          void api.downloads.protonRating(hit.id).then((result) => {
                            const label = result.ok ? result.reason : `${t('downloads.proton.failed')}: ${result.reason}`;
                            setProton((current) => ({ ...current, [hit.id]: label }));
                          });
                        }}
                      >
                        {t('downloads.proton.action')}
                      </Button>
                    )}
                    {proton[hit.id] === undefined ? null : (
                      <span className="nx-subtitle">{proton[hit.id]}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {destination.trim() === '' ? <p className="nx-subtitle">{t('downloads.destination.required')}</p> : null}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('downloads.queue')}</strong>
          {Object.entries(extractionErrors).map(([gameId, reason]) => (
            <p key={gameId} className="nx-banner">
              <span>
                {t('downloads.extract.failed')}: {reason}
              </span>
              <Button
                onClick={() => {
                  if (api === undefined) {
                    return;
                  }
                  void api.downloads.retryExtract(gameId).then(() => reload());
                }}
              >
                {t('downloads.extract.retry')}
              </Button>
            </p>
          ))}

          {tasks === null || tasks.length === 0 ? (
            <EmptyState title={t('downloads.queue.empty')} hint={t('downloads.queue.empty.hint')} />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {tasks.map((task) => (
                <li key={task.taskId} className="nx-stack">
                  <div className="nx-row nx-row--between">
                    <strong className="hub-break">{task.gameId}</strong>
                    <div className="nx-row">
                      <Badge tone={task.state === 'failed' ? 'danger' : task.state === 'completed' ? 'positive' : 'neutral'}>
                        {task.state}
                      </Badge>
                      {task.verified ? <Badge tone="positive">sha256 ✓</Badge> : null}
                    </div>
                  </div>
                  <div
                    className={`hub-progress${
                      task.state === 'completed' ? ' hub-progress--done' : task.state === 'failed' ? ' hub-progress--failed' : ''
                    }`}
                    role="progressbar"
                    aria-valuenow={task.totalBytes === null ? undefined : Math.round((task.receivedBytes / task.totalBytes) * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <span
                      className="hub-progress__fill"
                      style={{
                        width: task.totalBytes === null || task.totalBytes === 0
                          ? '0%'
                          : `${Math.min(100, (task.receivedBytes / task.totalBytes) * 100).toFixed(2)}%`,
                      }}
                    />
                  </div>
                  <span className="nx-subtitle">{progressLabel(task)}</span>
                  <div className="nx-row">
                    {task.state === 'downloading' || task.state === 'queued' ? (
                      <Button onClick={() => void api?.downloads.pause(task.taskId).then(reload)}>
                        {t('downloads.pause')}
                      </Button>
                    ) : null}
                    {task.state === 'paused' ? (
                      <Button onClick={() => void api?.downloads.resume(task.taskId).then(reload)}>
                        {t('downloads.resume')}
                      </Button>
                    ) : null}
                    {task.state === 'completed' || task.state === 'failed' ? null : (
                      <Button variant="danger" onClick={() => void api?.downloads.cancel(task.taskId).then(reload)}>
                        {t('downloads.cancel')}
                      </Button>
                    )}
                  </div>
                  {task.error === null ? null : <span className="nx-subtitle">{task.error}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <PlannedNoticeBlock />
    </div>
  );
}

/** O que continua planeado, dito com honestidade. */
function PlannedNoticeBlock(): ReactNode {
  const { t } = useInterface();
  return (
    <Card>
      <div className="nx-stack">
        <strong>{t('planned.title')}</strong>
        <span className="nx-subtitle">{t('planned.torrent')}</span>
        <span className="nx-subtitle">{t('planned.cloud-saves')}</span>
        <span className="nx-subtitle">{t('planned.friends')}</span>
      </div>
    </Card>
  );
}

/** Chave de tradução do tipo de correspondência (nunca chave dinâmica). */
function matchLabel(match: SourceSearchHit['match'], t: Translator): string {
  switch (match) {
    case 'alias-exact':
      return t('search.match.alias-exact');
    case 'title-exact':
      return t('search.match.title-exact');
    case 'prefix':
      return t('search.match.prefix');
    case 'syllable':
      return t('search.match.syllable');
    case 'consonant-prefix':
      return t('search.match.consonant-prefix');
    default:
      return t('search.match.fuzzy');
  }
}