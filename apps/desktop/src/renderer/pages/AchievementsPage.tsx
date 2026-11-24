import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';
import { ReputationCard } from '../components/ReputationCard.js';
import type { AchievementProgressView, PointEntryView } from '../../shared/preload-api.js';

/**
 * Conquistas — a economia do launcher.
 *
 * Nada aqui é desbloqueado por estar com o launcher aberto: as regras correm
 * no servidor sobre as sessões reais. O que não se alcançou mostra a barra
 * com o que falta — e os pontos vêm com a trilha de onde vieram (o saldo é a
 * soma das entradas, nunca um número solto).
 */

/** O que a página sabe. */
interface ProgressState {
  readonly items: readonly AchievementProgressView[];
  readonly balance: number;
  readonly totalAvailable: number;
  readonly ledger: readonly PointEntryView[];
}

export function AchievementsPage(): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [state, setState] = useState<ProgressState | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const signedIn = accessToken() !== null;

  const reload = useCallback(async () => {
    if (api === undefined || !signedIn) {
      return;
    }
    const token = accessToken() ?? '';
    const [achievements, points] = await Promise.all([
      fetch('/api/v1/achievements', { headers: { accept: 'application/json', authorization: `Bearer ${token}` } }),
      fetch('/api/v1/points', { headers: { accept: 'application/json', authorization: `Bearer ${token}` } }),
    ]);
    if (achievements.ok) {
      const body = (await achievements.json()) as {
        items: AchievementProgressView[];
        balance: number;
        totalAvailable: number;
      };
      setState({
        items: body.items,
        balance: body.balance,
        totalAvailable: body.totalAvailable,
        ledger: points.ok ? ((await points.json()) as { ledger: PointEntryView[] }).ledger : [],
      });
      return;
    }
    setMessage(t('error.generic'));
  }, [api, signedIn, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!signedIn) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('achievements.title')}</h1>
        <EmptyState title={t('achievements.signIn')} hint={t('achievements.signIn.hint')} />
      </div>
    );
  }

  const items = state?.items ?? [];
  const unlocked = items.filter((item) => item.unlocked).length;
  const percent = (value: number): string =>
    new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value);

  return (
    <div className="nx-stack">
      <ReputationCard />
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('achievements.title')}</h1>
          <p className="nx-subtitle">{t('achievements.subtitle')}</p>
        </div>
        <Button onClick={() => void reload()}>{t('common.action.retry')}</Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <div className="hub-settings-grid">
        <Card>
          <div className="nx-stack">
            <strong>{t('achievements.balance')}</strong>
            <span className="hub-hero__title">{new Intl.NumberFormat(locale).format(state?.balance ?? 0)}</span>
            <span className="nx-subtitle">
              {t('achievements.available', { total: new Intl.NumberFormat(locale).format(state?.totalAvailable ?? 0) })}
            </span>
          </div>
        </Card>
        <Card>
          <div className="nx-stack">
            <strong>{t('achievements.unlocked')}</strong>
            <span className="hub-hero__title">{new Intl.NumberFormat(locale).format(unlocked)}</span>
            <span className="nx-subtitle">
              {t('achievements.of', { total: new Intl.NumberFormat(locale).format(items.length) })}
            </span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="nx-stack">
          {items.map((item) => (
            <div key={item.id} className="hub-row hub-row--between">
              <div className="nx-stack">
                <span className="hub-break">{t(achievementLabel(item.id))}</span>
                <span className="nx-subtitle">{t(achievementHint(item.id))}</span>
                <div
                  className="hub-progress"
                  role="progressbar"
                  aria-valuenow={Math.round(item.progress * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span className="hub-progress__bar" style={{ width: percent(item.progress) }} />
                </div>
                <span className="nx-subtitle">
                  {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(item.value)} /{' '}
                  {new Intl.NumberFormat(locale).format(item.target)}
                </span>
              </div>
              <div className="hub-row">
                {item.unlocked ? <Badge tone="positive">{item.points} {t('achievements.points')}</Badge> : null}
                <Badge>{t('achievements.holders', { count: item.holders })}</Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {state !== null && state.ledger.length > 0 ? (
        <Card>
          <div className="nx-stack">
            <strong>{t('achievements.ledger')}</strong>
            {state.ledger.slice(0, 8).map((entry) => (
              <div key={entry.id} className="hub-row hub-row--between">
                <span className="hub-break">{t(ledgerLabel(entry.reason))}</span>
                <div className="hub-row">
                  <Badge tone="positive">+{new Intl.NumberFormat(locale).format(entry.delta)}</Badge>
                  <span className="nx-subtitle">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt))}
                  </span>
                </div>
              </div>
            ))}
            <span className="nx-subtitle">{t('achievements.ledger.hint')}</span>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

/** Chave do nome de uma conquista (explícita, nunca dinâmica). */
type AchievementLabelKey =
  | 'achievement.firstSession'
  | 'achievement.tenHours'
  | 'achievement.hundredHours'
  | 'achievement.fiveGames'
  | 'achievement.nightOwl'
  | 'achievement.marathon';

/** Chave da descrição de uma conquista (explícita, nunca dinâmica). */
type AchievementHintKey =
  | 'achievement.hint.firstSession'
  | 'achievement.hint.tenHours'
  | 'achievement.hint.hundredHours'
  | 'achievement.hint.fiveGames'
  | 'achievement.hint.nightOwl'
  | 'achievement.hint.marathon';

function achievementLabel(id: string): AchievementLabelKey {
  switch (id) {
    case 'first-session':
      return 'achievement.firstSession';
    case 'ten-hours':
      return 'achievement.tenHours';
    case 'hundred-hours':
      return 'achievement.hundredHours';
    case 'five-games':
      return 'achievement.fiveGames';
    case 'night-owl':
      return 'achievement.nightOwl';
    default:
      return 'achievement.marathon';
  }
}

/** Rótulo de uma entrada do livro (o motivo é a conquista que a deu). */
function ledgerLabel(reason: string): AchievementLabelKey {
  // O motivo vem no formato `achievement.<id>`: a chave de tradução é a do
  // nome da conquista — o mesmo mapa explícito dos cartões.
  return achievementLabel(reason.replace('achievement.', ''));
}

/** Chave da descrição de uma conquista (explícita, nunca dinâmica). */
function achievementHint(id: string): AchievementHintKey {
  switch (id) {
    case 'first-session':
      return 'achievement.hint.firstSession';
    case 'ten-hours':
      return 'achievement.hint.tenHours';
    case 'hundred-hours':
      return 'achievement.hint.hundredHours';
    case 'five-games':
      return 'achievement.hint.fiveGames';
    case 'night-owl':
      return 'achievement.hint.nightOwl';
    default:
      return 'achievement.hint.marathon';
  }
}