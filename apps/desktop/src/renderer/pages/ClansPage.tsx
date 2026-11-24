import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, TextInput, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';
import { apiRequest } from '../lib/api.js';

/**
 * Clãs — grupos de jogadores com dono, oficiais e membros.
 *
 * Exige conta NEXORA: sem sessão, a página explica o que falta. As regras que
 * a API impõe são as mesmas que a interface respeita — mudar papéis é botão
 * do dono, expulsar segue as regras do domínio, e o dono não sai sem
 * dissolver. Um recurso de outro utilizador devolve 404: a interface nunca
 * mostra o botão para quem não pode.
 */

/** Um clã (vista do contrato). */
interface ClanView {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly description: string;
  readonly ownerId: string;
  readonly memberCount: number;
  readonly full: boolean;
  readonly createdAt: string;
}

/** A pertença (o que posso fazer neste clã). */
interface MembershipView {
  readonly clan: ClanView;
  readonly role: 'owner' | 'officer' | 'member';
}

/** Um membro. */
interface MemberView {
  readonly userId: string;
  readonly role: string;
  readonly joinedAt: string;
}

/** Um convite recebido. */
interface InviteView {
  readonly id: string;
  readonly clan: { readonly id: string; readonly name: string; readonly tag: string } | null;
  readonly createdAt: string;
}

export function ClansPage(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();

  const [mine, setMine] = useState<readonly MembershipView[] | null>(null);
  const [invites, setInvites] = useState<readonly InviteView[]>([]);
  const [open, setOpen] = useState<{ readonly clan: ClanView; readonly members: readonly MemberView[]; readonly myRole: string | null } | null>(null);
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (user === null) {
      return;
    }
    try {
      const [clans, pendentes] = await Promise.all([
        apiRequest<{ items: MembershipView[] }>('/api/v1/clans/mine'),
        apiRequest<{ items: InviteView[] }>('/api/v1/clans/invites/mine'),
      ]);
      setMine(clans.items);
      setInvites(pendentes.items);
    } catch {
      setMine([]);
      setInvites([]);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<unknown>, sucesso: string) => {
      try {
        await action();
        setMessage(sucesso);
        await reload();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : t('clans.failed'));
      }
    },
    [reload, t],
  );

  const onCreate = useCallback(
    () => run(
      () => apiRequest('/api/v1/clans', { method: 'POST', body: { name: name.trim(), tag: tag.trim(), description: description.trim() } }),
      t('clans.created'),
    ).then(() => {
      setName('');
      setTag('');
      setDescription('');
    }),
    [description, name, run, t, tag],
  );

  const onOpen = useCallback(
    async (clanId: string) => {
      try {
        const detail = await apiRequest<{ clan: ClanView; members: MemberView[]; myRole: string | null }>(`/api/v1/clans/${clanId}`);
        setOpen({ clan: detail.clan, members: detail.members, myRole: detail.myRole });
        setInviteEmail('');
        setMessage(null);
      } catch {
        setMessage(t('clans.failed'));
      }
    },
    [t],
  );

  const roleLabel = (role: string): string =>
    role === 'owner' ? t('clans.role.owner') : role === 'officer' ? t('clans.role.officer') : t('clans.role.member');

  if (user === null) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('clans.title')}</h1>
        <EmptyState title={t('clans.title')} hint={t('community.signIn')} />
      </div>
    );
  }

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <h1 className="nx-title">{t('clans.title')}</h1>
        {open === null ? null : <Button onClick={() => setOpen(null)}>{t('forums.back')}</Button>}
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      {open === null ? (
        <>
          <Card>
            <div className="nx-stack">
              <strong>{t('clans.create')}</strong>
              <TextInput label={t('clans.name')} placeholder={t('clans.name')} maxLength={24} value={name} onChange={(event) => setName(event.target.value)} />
              <TextInput label={t('clans.tag')} placeholder={t('clans.tag')} maxLength={5} value={tag} onChange={(event) => setTag(event.target.value)} />
              <TextInput label={t('clans.description')} placeholder={t('clans.description')} value={description} onChange={(event) => setDescription(event.target.value)} />
              <div className="hub-row">
                <Button variant="primary" onClick={() => void onCreate()} disabled={name.trim().length < 3 || tag.trim() === ''}>
                  {t('clans.create')}
                </Button>
              </div>
            </div>
          </Card>

          {invites.length > 0 ? (
            <Card>
              <div className="nx-stack">
                <strong>{t('clans.invites')}</strong>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                  {invites.map((invite) => (
                    <li key={invite.id} className="hub-row hub-row--between">
                      <span>
                        [{invite.clan?.tag ?? '??'}] {invite.clan?.name ?? '—'}
                      </span>
                      <span className="hub-row">
                        <Button onClick={() => void run(() => apiRequest(`/api/v1/clans/invites/${invite.id}/answer`, { method: 'POST', body: { accept: true } }), t('clans.joined'))}>
                          {t('clans.accept')}
                        </Button>
                        <Button onClick={() => void run(() => apiRequest(`/api/v1/clans/invites/${invite.id}/answer`, { method: 'POST', body: { accept: false } }), t('clans.declined'))}>
                          {t('clans.decline')}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          ) : null}

          <Card>
            <div className="nx-stack">
              <strong>{t('clans.mine')}</strong>
              {mine === null ? (
                <p className="nx-subtitle">{t('common.loading')}</p>
              ) : mine.length === 0 ? (
                <p className="nx-subtitle">{t('clans.empty')}</p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                  {mine.map((entry) => (
                    <li key={entry.clan.id} className="hub-row hub-row--between">
                      <button type="button" className="hub-link" onClick={() => void onOpen(entry.clan.id)}>
                        [{entry.clan.tag}] {entry.clan.name}
                      </button>
                      <span className="hub-row">
                        <Badge>{new Intl.NumberFormat(locale).format(entry.clan.memberCount)}</Badge>
                        <Badge tone={entry.role === 'owner' ? 'positive' : entry.role === 'officer' ? 'neutral' : 'planned'}>
                          {roleLabel(entry.role)}
                        </Badge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </>
      ) : (
        <Card>
          <div className="nx-stack">
            <strong>
              [{open.clan.tag}] {open.clan.name}
            </strong>
            {open.clan.description === '' ? null : <p className="hub-about__text">{open.clan.description}</p>}
            <span className="nx-subtitle">
              {t('clans.members')}: {new Intl.NumberFormat(locale).format(open.clan.memberCount)}
              {open.clan.full ? ` · ${t('clans.full')}` : ''}
            </span>

            {open.myRole === 'owner' || open.myRole === 'officer' ? (
              <div className="nx-stack">
                <TextInput
                  label={t('clans.inviteEmail')}
                  placeholder={t('clans.inviteEmail')}
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
                <div className="hub-row">
                  <Button
                    onClick={() => void run(
                      () => apiRequest(`/api/v1/clans/${open.clan.id}/invites`, { method: 'POST', body: { email: inviteEmail.trim() } }),
                      t('clans.invited'),
                    ).then(() => setInviteEmail(''))}
                    disabled={!inviteEmail.includes('@')}
                  >
                    {t('clans.invite')}
                  </Button>
                </div>
              </div>
            ) : null}

            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {open.members.map((member) => (
                <li key={member.userId} className="hub-row hub-row--between">
                  <span className="hub-break">{member.userId === user.id ? t('clans.you') : member.userId.slice(0, 8)}</span>
                  <span className="hub-row">
                    <Badge tone={member.role === 'owner' ? 'positive' : 'neutral'}>{roleLabel(member.role)}</Badge>
                    {open.myRole === 'owner' && member.userId !== open.clan.ownerId ? (
                      <>
                        <Button
                          onClick={() => void run(
                            () => apiRequest(`/api/v1/clans/${open.clan.id}/members/${member.userId}/role`, { method: 'POST', body: { role: member.role === 'officer' ? 'member' : 'officer' } }),
                            t('clans.roleChanged'),
                          )}
                        >
                          {member.role === 'officer' ? t('clans.demote') : t('clans.promote')}
                        </Button>
                        <Button
                          onClick={() => void run(
                            () => apiRequest(`/api/v1/clans/${open.clan.id}/members/${member.userId}/kick`, { method: 'POST' }),
                            t('clans.kicked'),
                          )}
                        >
                          {t('clans.kick')}
                        </Button>
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>

            <div className="hub-row">
              {open.myRole === 'owner' ? (
                <Button onClick={() => void run(() => apiRequest(`/api/v1/clans/${open.clan.id}`, { method: 'DELETE' }), t('clans.dissolved')).then(() => setOpen(null))}>
                  {t('clans.dissolve')}
                </Button>
              ) : (
                <Button onClick={() => void run(() => apiRequest(`/api/v1/clans/${open.clan.id}/leave`, { method: 'POST' }), t('clans.left')).then(() => setOpen(null))}>
                  {t('clans.leave')}
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}