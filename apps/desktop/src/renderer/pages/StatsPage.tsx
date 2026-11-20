import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';

/**
 * Estatísticas e timeline — a página do jogador.
 *
 * Os números vêm do **servidor** (a API agrega sobre as sessões); o launcher
 * não soma listas no browser. Sem sessão, a página explica o que faltar em
 * vez de mostrar zeros a fingir dados.
 */

/** Resumo devolvido pela API. */
interface StatsSummary {
  readonly totalHours: number;
  readonly sessionCount: number;
  readonly distinctGames: number;
  readonly topGames: readonly { readonly gameId: string; readonly hours: number }[];
  readonly topTags: readonly { readonly tag: string; readonly hours: number }[];
  readonly hourHistogram: readonly number[];
  readonly peakHour: number | null;
}

/** Um evento da timeline. */
interface TimelineItem {
  readonly id: string;
  readonly type: 'session-ended' | 'comment-created' | 'review-created' | 'wishlist-added';
  readonly at: string;
  readonly gameId: string | null;
  readonly summary: string;
}

export function StatsPage(): ReactNode {
  const { t, locale } = useInterface();
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [timeline, setTimeline] = useState<readonly TimelineItem[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const signedIn = accessToken() !== null;

  const reload = useCallback(async () => {
    if (!signedIn) {
      setSummary(null);
      setTimeline(null);
      return;
    }
    try {
      const [statsRes, timelineRes] = await Promise.all([
        fetch('/api/v1/stats/summary', { headers: { accept: 'application/json', authorization: `Bearer ${accessToken()}` } }),
        fetch('/api/v1/timeline?limit=20', { headers: { accept: 'application/json', authorization: `Bearer ${accessToken()}` } }),
      ]);
      if (statsRes.ok) {
        setSummary((await statsRes.json()) as StatsSummary);
      }
      if (timelineRes.ok) {
        const body = (await timelineRes.json()) as { items: TimelineItem[] };
        setTimeline(body.items);
      }
    } catch {
      setMessage(t('error.generic'));
    }
  }, [signedIn, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const peakLabel = useMemo(() => {
    if (summary === null || summary.peakHour === null) {
      return '—';
    }
    const hour = String(summary.peakHour).padStart(2, '0');
    return `${hour}:00`;
  }, [summary]);

  if (!signedIn) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('stats.title')}</h1>
        <EmptyState title={t('stats.signIn')} hint={t('stats.signIn.hint')} />
      </div>
    );
  }

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('stats.title')}</h1>
          <p className="nx-subtitle">{t('stats.subtitle')}</p>
        </div>
        <Button onClick={() => void reload()}>{t('common.action.retry')}</Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <div className="hub-settings-grid">
        <Card>
          <div className="nx-stack">
            <strong>{t('stats.totalHours')}</strong>
            <span className="hub-hero__title">{formatNumber(summary?.totalHours ?? 0, locale)}</span>
          </div>
        </Card>
        <Card>
          <div className="nx-stack">
            <strong>{t('stats.sessions')}</strong>
            <span className="hub-hero__title">{formatNumber(summary?.sessionCount ?? 0, locale)}</span>
          </div>
        </Card>
        <Card>
          <div className="nx-stack">
            <strong>{t('stats.games')}</strong>
            <span className="hub-hero__title">{formatNumber(summary?.distinctGames ?? 0, locale)}</span>
          </div>
        </Card>
        <Card>
          <div className="nx-stack">
            <strong>{t('stats.peakHour')}</strong>
            <span className="hub-hero__title">{peakLabel}</span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="nx-stack">
          <strong>{t('stats.topGames')}</strong>
          {summary === null || summary.topGames.length === 0 ? (
            <p className="nx-subtitle">{t('stats.empty')}</p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'grid', gap: '0.25rem' }}>
              {summary.topGames.map((game) => (
                <li key={game.gameId} className="hub-row">
                  <span className="hub-break">{game.gameId}</span>
                  <span className="nx-subtitle">{formatNumber(game.hours, locale, { maximumFractionDigits: 1 })} h</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('stats.favoriteGenre')}</strong>
          {summary === null || summary.topTags.length === 0 ? (
            <p className="nx-subtitle">{t('stats.empty')}</p>
          ) : (
            <div className="hub-suggestions">
              {summary.topTags.map((tag) => (
                <Badge key={tag.tag}>
                  {tag.tag} · {formatNumber(tag.hours, locale, { maximumFractionDigits: 1 })} h
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('stats.timeline')}</strong>
          {timeline === null || timeline.length === 0 ? (
            <p className="nx-subtitle">{t('stats.timeline.empty')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {timeline.map((event) => (
                <li key={event.id} className="nx-stack">
                  <div className="hub-row">
                    <Badge>{t(timelineLabel(event.type))}</Badge>
                    <span className="nx-subtitle">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.at))}
                    </span>
                  </div>
                  <span className="hub-break">{event.gameId ?? event.summary}</span>
                  <span className="nx-subtitle">{event.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Chave de tradução de um tipo de evento (explícita, nunca dinâmica). */
function timelineLabel(type: TimelineItem['type']):
  | 'timeline.session-ended'
  | 'timeline.comment-created'
  | 'timeline.review-created'
  | 'timeline.wishlist-added' {
  switch (type) {
    case 'comment-created':
      return 'timeline.comment-created';
    case 'review-created':
      return 'timeline.review-created';
    case 'wishlist-added':
      return 'timeline.wishlist-added';
    default:
      return 'timeline.session-ended';
  }
}

/** Número formatado no idioma. */
function formatNumber(value: number, locale: string, options?: Readonly<Intl.NumberFormatOptions>): string {
  return new Intl.NumberFormat(locale, options ?? {}).format(value);
}