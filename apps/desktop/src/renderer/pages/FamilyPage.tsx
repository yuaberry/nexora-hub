import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';
import { useAuth } from '../state/auth.js';
import type { FamilyGameView, FamilyPlanView, FamilyView } from '../../shared/preload-api.js';

/**
 * Família — grupo com limite de plano e biblioteca partilhada.
 *
 * As regras vivem no **servidor**: quem pode entrar, quantos cabem e quem
 * remove quem. O launcher mostra o que a conta tem — e quando não tem grupo,
 * explica o que falta em vez de fingir. Sem sessão, a página não esconde
 * botões: diz que a Família é da conta.
 */

/** O que a página sabe do grupo. */
interface FamilyState {
  readonly group: FamilyView | null;
  readonly plan: FamilyPlanView | null;
  readonly games: readonly FamilyGameView[];
}

export function FamilyPage(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();
  const api = globalThis.window?.nexora;

  const [state, setState] = useState<FamilyState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [lastCode, setLastCode] = useState<string | null>(null);

  const signedIn = accessToken() !== null;

  const reload = useCallback(async () => {
    if (api === undefined || !signedIn) {
      setState({ group: null, plan: null, games: [] });
      return;
    }
    const token = accessToken() ?? '';
    const [family, games] = await Promise.all([api.family.get(token), api.family.games(token)]);
    setState({
      group: family.ok ? family.group ?? null : null,
      plan: family.ok ? family.plan ?? null : null,
      games: games.ok ? games.items ?? [] : [],
    });
    if (!family.ok) {
      setMessage(family.message ?? t('error.generic'));
    }
  }, [api, signedIn, t]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; message?: string }>) => {
      const result = await action();
      setMessage(result.ok ? null : (result.message ?? t('error.generic')));
      await reload();
    },
    [reload, t],
  );

  const onCreate = useCallback(() => {
    const token = accessToken() ?? '';
    return run(async () => {
      const result = await api?.family.create(name.trim(), token) ?? { ok: false };
      if (result.ok) {
        setName('');
        setLastCode(null);
      }
      return result;
    });
  }, [api, name, run]);

  const onInvite = useCallback(() => {
    const token = accessToken() ?? '';
    return run(async () => {
      const result = await api?.family.invite(email.trim(), token) ?? { ok: false };
      if (result.ok && result.code !== undefined) {
        setLastCode(result.code);
        setEmail('');
      }
      return result;
    });
  }, [api, email, run]);

  const onAccept = useCallback(() => {
    const token = accessToken() ?? '';
    return run(async () => {
      const result = await api?.family.accept(code.trim().toUpperCase(), token) ?? { ok: false };
      if (result.ok) {
        setCode('');
      }
      return result;
    });
  }, [api, code, run]);

  const onRemove = useCallback(
    (userId: string) => {
      const token = accessToken() ?? '';
      return run(async () => (await api?.family.remove(userId, token)) ?? { ok: false });
    },
    [api, run],
  );

  const onDissolve = useCallback(() => {
    const token = accessToken() ?? '';
    return run(async () => (await api?.family.dissolve(token)) ?? { ok: false });
  }, [api, run]);

  if (!signedIn) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('family.title')}</h1>
        <EmptyState title={t('family.signIn')} hint={t('family.signIn.hint')} />
      </div>
    );
  }

  const group = state?.group ?? null;

  if (group === null) {
    return (
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <div className="nx-stack">
            <h1 className="nx-title">{t('family.title')}</h1>
            <p className="nx-subtitle">{t('family.subtitle')}</p>
          </div>
          <PlannedBadge label={t('planned.badge')} />
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

        <Card>
          <div className="nx-stack">
            <strong>{t('family.create')}</strong>
            <span className="nx-subtitle">{t('family.create.hint')}</span>
            <div className="hub-row">
              <input
                className="nx-input"
                value={name}
                placeholder={t('family.create.name')}
                aria-label={t('family.create.name')}
                onChange={(event) => {
                  setName(event.target.value);
                }}
              />
              <Button variant="primary" onClick={() => void onCreate()}>
                {t('family.create.action')}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <div className="nx-stack">
            <strong>{t('family.accept')}</strong>
            <span className="nx-subtitle">{t('family.accept.hint')}</span>
            <div className="hub-row">
              <input
                className="nx-input"
                value={code}
                placeholder={t('family.accept.code')}
                aria-label={t('family.accept.code')}
                onChange={(event) => {
                  setCode(event.target.value);
                }}
              />
              <Button onClick={() => void onAccept()}>{t('family.accept.action')}</Button>
            </div>
          </div>
        </Card>

        <Benefits plan={state?.plan ?? null} />
      </div>
    );
  }

  const isOwner = user !== null && user.id === group.ownerId;
  const pending = group.invites.filter((invite) => invite.status === 'pending');
  const limitLabel =
    group.plan.maxMembers === null
      ? t('family.plan.unlimited')
      : new Intl.NumberFormat(locale).format(group.plan.maxMembers);

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{group.name}</h1>
          <p className="nx-subtitle">
            {t('family.plan.limit', { max: limitLabel })} ·{' '}
            {group.plan.remainingSlots === null
              ? t('family.plan.unlimited')
              : t('family.plan.remaining', { remaining: new Intl.NumberFormat(locale).format(group.plan.remainingSlots) })}
          </p>
        </div>
        <Button onClick={() => void onDissolve()} disabled={!isOwner}>
          {t('family.dissolve')}
        </Button>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      {lastCode === null ? null : (
        <p className="nx-banner">
          <span>
            {t('family.invites.code')}: <strong>{lastCode}</strong>
          </span>
        </p>
      )}

      <div className="hub-settings-grid">
        <Card>
          <div className="nx-stack">
            <strong>{t('family.members')}</strong>
            <span className="hub-hero__title">{new Intl.NumberFormat(locale).format(group.members.length)}</span>
          </div>
        </Card>
        <Card>
          <div className="nx-stack">
            <strong>{t('family.games')}</strong>
            <span className="hub-hero__title">{new Intl.NumberFormat(locale).format(state?.games.length ?? 0)}</span>
          </div>
        </Card>
      </div>

      <Card>
        <div className="nx-stack">
          <strong>{t('family.members')}</strong>
          {group.members.map((member) => (
            <div key={member.userId} className="hub-row hub-row--between">
              <div className="nx-stack">
                <span className="hub-break">{member.displayName ?? member.email ?? member.userId}</span>
                <span className="nx-subtitle">{t(roleKey(member.role))}</span>
              </div>
              {isOwner ? (
                <Button
                  onClick={() => void onRemove(member.userId)}
                  disabled={member.role === 'owner'}
                  aria-label={t('family.remove')}
                >
                  {t('family.remove')}
                </Button>
              ) : member.userId === user?.id ? (
                <Button onClick={() => void onRemove(member.userId)}>{t('family.leave')}</Button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('family.invites.pending')}</strong>
          {pending.length === 0 ? (
            <p className="nx-subtitle">{t('family.invites.empty')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {pending.map((invite) => (
                <li key={invite.id} className="hub-row hub-row--between">
                  <span className="hub-break">{invite.email}</span>
                  <Badge>{invite.code}</Badge>
                  <span className="nx-subtitle">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(invite.expiresAt))}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="hub-row">
            <input
              className="nx-input"
              value={email}
              placeholder={t('family.invites.email')}
              aria-label={t('family.invites.email')}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <Button onClick={() => void onInvite()}>{t('family.invites.action')}</Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('family.games')}</strong>
          {state === null || state.games.length === 0 ? (
            <p className="nx-subtitle">{t('family.games.empty')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {state.games.map((game) => (
                <li key={game.externalKey} className="hub-row hub-row--between">
                  <span className="hub-break">{game.title}</span>
                  <span className="nx-subtitle">
                    {game.owners.map((owner) => owner.displayName ?? owner.userId).join(', ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/** Benefícios do plano — chaves explícitas, nunca dinâmicas. */
function Benefits({ plan }: { readonly plan: FamilyPlanView | null }): ReactNode {
  const { t, locale } = useInterface();
  return (
    <Card>
      <div className="nx-stack">
        <strong>{t('family.benefits')}</strong>
        {plan === null || plan.maxMembers === null
          ? t('family.plan.unlimited')
          : t('family.benefit.members', { max: new Intl.NumberFormat(locale).format(plan.maxMembers) })}
        {(plan?.benefits ?? [])
          .filter((benefit) => benefit.labelKey !== 'family.benefit.members')
          .map((benefit) => (
            <div key={benefit.labelKey} className="hub-row hub-row--between">
              <span className="hub-break">{t(benefitKey(benefit.labelKey))}</span>
              {benefit.available ? (
                <Badge>{benefit.value || t('family.benefit.included')}</Badge>
              ) : (
                <PlannedBadge label={t('planned.badge')} />
              )}
            </div>
          ))}
        <span className="nx-subtitle">{t('family.benefits.hint')}</span>
      </div>
    </Card>
  );
}

/** Chave de tradução de um papel (explícita). */
function roleKey(role: string): 'family.role.owner' | 'family.role.adult' | 'family.role.member' {
  switch (role) {
    case 'owner':
      return 'family.role.owner';
    case 'adult':
      return 'family.role.adult';
    default:
      return 'family.role.member';
  }
}

/** Chave de tradução de um benefício (explícita). */
function benefitKey(labelKey: string): 'family.benefit.members' | 'family.benefit.sharedLibrary' | 'family.benefit.saveSharing' {
  switch (labelKey) {
    case 'family.benefit.members':
      return 'family.benefit.members';
    case 'family.benefit.saveSharing':
      return 'family.benefit.saveSharing';
    default:
      return 'family.benefit.sharedLibrary';
  }
}