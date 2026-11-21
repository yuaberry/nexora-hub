import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';
import type { FriendRequestView, FriendView, PresenceView } from '../../shared/preload-api.js';

/**
 * Amigos — quem joga o quê.
 *
 * A presença é um **coração que bate**: o launcher bate enquanto um jogo
 * corre (a cada 30 s) e diz que parou quando a sessão acaba. Quem passou da
 * validade aparece offline — nada de "a jogar" fantasma. Só amigos vêem a
 * presença uns dos outros; a de um estranho não existe nesta API.
 */

/** Intervalo de actualização da lista (a validade do coração é 45 s). */
const REFRESH_MS = 15_000;

/** O que a página sabe. */
interface SocialState {
  readonly friends: readonly FriendView[];
  readonly incoming: readonly FriendRequestView[];
  readonly outgoing: readonly FriendRequestView[];
  readonly presence: PresenceView | null;
}

export function FriendsPage({
  onMessage,
}: {
  /** Abre o chat com um amigo (a App é quem navega). */
  readonly onMessage: (friend: { userId: string; displayName: string | null; email: string | null }) => void;
}): ReactNode {
  const { t } = useInterface();
  const api = globalThis.window?.nexora;

  const [state, setState] = useState<SocialState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState('');

  const signedIn = accessToken() !== null;

  const reload = useCallback(async () => {
    if (api === undefined || !signedIn) {
      return;
    }
    const token = accessToken() ?? '';
    const [list, presence] = await Promise.all([api.friends.list(token), api.friends.presence(token)]);
    setState({
      friends: list.ok ? list.friends ?? [] : [],
      incoming: list.ok ? list.incoming ?? [] : [],
      outgoing: list.ok ? list.outgoing ?? [] : [],
      presence: presence.ok ? presence : null,
    });
    if (!list.ok) {
      setMessage(list.message ?? t('error.generic'));
    }
  }, [api, signedIn, t]);

  // A lista actualiza-se sozinha: a presença de quem está a jogar muda sem
  // ninguém carregar em nada.
  useEffect(() => {
    void reload();
    const timer = setInterval(() => {
      void reload();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [reload]);

  const run = useCallback(
    async (action: () => Promise<{ ok: boolean; message?: string }>) => {
      const result = await action();
      setMessage(result.ok ? null : (result.message ?? t('error.generic')));
      await reload();
    },
    [reload, t],
  );

  const onRequest = useCallback(() => {
    const token = accessToken() ?? '';
    return run(async () => {
      const result = await api?.friends.request(email.trim(), token) ?? { ok: false };
      if (result.ok) {
        setEmail('');
      }
      return result;
    });
  }, [api, email, run]);

  const onRespond = useCallback(
    (requestId: string, action: 'accept' | 'decline' | 'cancel') => {
      const token = accessToken() ?? '';
      return run(async () => (await api?.friends.respond(requestId, action, token)) ?? { ok: false });
    },
    [api, run],
  );

  const onRemove = useCallback(
    (userId: string) => {
      const token = accessToken() ?? '';
      return run(async () => (await api?.friends.remove(userId, token)) ?? { ok: false });
    },
    [api, run],
  );

  if (!signedIn) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('friends.title')}</h1>
        <EmptyState title={t('friends.signIn')} hint={t('friends.signIn.hint')} />
      </div>
    );
  }

  const friends = state?.friends ?? [];
  const presenceByUser = new Map((state?.presence?.friends ?? []).map((entry) => [entry.userId, entry]));
  const onlineCount = friends.filter((friend) => presenceByUser.has(friend.userId)).length;

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('friends.title')}</h1>
          <p className="nx-subtitle">{t('friends.subtitle')}</p>
        </div>
        <span className="nx-subtitle">
          {t('friends.online', { count: onlineCount, total: friends.length })}
        </span>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <Card>
        <div className="nx-stack">
          <strong>{t('friends.add')}</strong>
          <div className="hub-row">
            <input
              className="nx-input"
              value={email}
              placeholder={t('friends.add.email')}
              aria-label={t('friends.add.email')}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
            <Button variant="primary" onClick={() => void onRequest()}>
              {t('friends.add.action')}
            </Button>
          </div>
          <span className="nx-subtitle">{t('friends.add.hint')}</span>
        </div>
      </Card>

      {state !== null && state.incoming.length > 0 ? (
        <Card>
          <div className="nx-stack">
            <strong>{t('friends.incoming')}</strong>
            {state.incoming.map((request) => (
              <div key={request.id} className="hub-row hub-row--between">
                <span className="hub-break">{request.displayName ?? request.email ?? request.userId}</span>
                <div className="hub-row">
                  <Button onClick={() => void onRespond(request.id, 'accept')}>{t('friends.accept')}</Button>
                  <Button onClick={() => void onRespond(request.id, 'decline')}>{t('friends.decline')}</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {state !== null && state.outgoing.length > 0 ? (
        <Card>
          <div className="nx-stack">
            <strong>{t('friends.outgoing')}</strong>
            {state.outgoing.map((request) => (
              <div key={request.id} className="hub-row hub-row--between">
                <span className="hub-break">{request.displayName ?? request.email ?? request.userId}</span>
                <Button onClick={() => void onRespond(request.id, 'cancel')}>{t('friends.cancel')}</Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <div className="nx-stack">
          <strong>{t('friends.list')}</strong>
          {friends.length === 0 ? (
            <p className="nx-subtitle">{t('friends.empty')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {friends.map((friend) => {
                const presence = presenceByUser.get(friend.userId);
                const label = presence?.gameId
                  ? t('friends.playing', { game: gameTitle(presence.gameId) })
                  : t('friends.onlineNow');
                return (
                  <li key={friend.userId} className="hub-row hub-row--between">
                    <div className="nx-stack">
                      <span className="hub-break">{friend.displayName ?? friend.email ?? friend.userId}</span>
                      <span className="nx-subtitle">
                        {presence === undefined
                          ? t('friends.offline')
                          : label}
                      </span>
                    </div>
                    <div className="hub-row">
                      {presence === undefined ? null : <Badge tone="positive">{t('friends.onlineNow')}</Badge>}
                      <Button onClick={() => void onMessage(friend)}>{t('friends.message')}</Button>
                      <Button onClick={() => void onRemove(friend.userId)}>{t('friends.remove')}</Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <span className="nx-subtitle">{t('friends.presenceHint', { seconds: 45 })}</span>
        </div>
      </Card>
    </div>
  );
}

/** Título legível do jogo em curso (o id local costuma ser o nome da pasta). */
function gameTitle(gameId: string): string {
  return gameId
    .split('/')
    .filter((part) => part.length > 0)
    .pop()
    ?.replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase()) ?? gameId;
}

