import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, TextInput, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';
import { ApiError, apiRequest } from '../lib/api.js';

/**
 * Fórum do jogo — tópicos e respostas.
 *
 * Exige conta NEXORA: sem sessão, a secção explica o que falta em vez de
 * mostrar um formulário que vai falhar. As regras que a API impõe são as
 * mesmas que a interface respeita: um tópico **fechado** só aceita resposta
 * de quem o criou, e fechar ou apagar o tópico de outro devolve 404 — a
 * interface nunca mostra o botão para quem não é o dono.
 */

/** Um tópico (vista do contrato). */
interface ThreadView {
  readonly id: string;
  readonly authorId: string;
  readonly title: string;
  readonly body: string;
  readonly replyCount: number;
  readonly locked: boolean;
  readonly createdAt: string;
  readonly lastActivityAt: string;
}

/** Uma resposta (vista do contrato). */
interface PostView {
  readonly id: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

/** O tópico aberto, com as suas respostas. */
interface ThreadDetail {
  readonly thread: ThreadView;
  readonly items: readonly PostView[];
}

export function ForumSection({ gameId }: { readonly gameId: string }): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();

  const [threads, setThreads] = useState<readonly ThreadView[] | null>(null);
  const [open, setOpen] = useState<ThreadDetail | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await apiRequest<{ items: ThreadView[] }>(`/api/v1/threads?game=${encodeURIComponent(gameId)}`);
      setThreads(list.items);
    } catch {
      setThreads([]);
    }
  }, [gameId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreate = useCallback(async () => {
    if (title.trim() === '' || body.trim() === '') {
      return;
    }
    try {
      await apiRequest<ThreadView>(`/api/v1/threads?game=${encodeURIComponent(gameId)}`, {
        method: 'POST',
        body: { title: title.trim(), body: body.trim() },
      });
      setTitle('');
      setBody('');
      setMessage(null);
      await reload();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t('forums.failed'));
    }
  }, [body, gameId, reload, t, title]);

  const onOpen = useCallback(async (threadId: string) => {
    try {
      const detail = await apiRequest<ThreadDetail>(`/api/v1/threads/${threadId}`);
      setOpen(detail);
      setReply('');
      setMessage(null);
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t('forums.failed'));
    }
  }, [t]);

  const onReply = useCallback(async () => {
    if (open === null || reply.trim() === '') {
      return;
    }
    try {
      await apiRequest<PostView>(`/api/v1/threads/${open.thread.id}/posts`, {
        method: 'POST',
        body: { body: reply.trim() },
      });
      setReply('');
      await onOpen(open.thread.id);
      await reload();
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : t('forums.failed'));
    }
  }, [onOpen, open, reload, reply, t]);

  const onLock = useCallback(
    async (thread: ThreadView) => {
      try {
        await apiRequest(`/api/v1/threads/${thread.id}/lock`, {
          method: 'POST',
          body: { locked: !thread.locked },
        });
        await reload();
        if (open?.thread.id === thread.id) {
          await onOpen(thread.id);
        }
      } catch {
        setMessage(t('forums.failed'));
      }
    },
    [open, onOpen, reload, t],
  );

  const onDeleteThread = useCallback(
    async (threadId: string) => {
      try {
        await apiRequest(`/api/v1/threads/${threadId}`, { method: 'DELETE' });
        if (open?.thread.id === threadId) {
          setOpen(null);
        }
        await reload();
      } catch {
        setMessage(t('forums.failed'));
      }
    },
    [open, reload, t],
  );

  const mine = (authorId: string): boolean => user !== null && user.id === authorId;

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('forums.title')}</strong>
          {open === null ? null : <Button onClick={() => setOpen(null)}>{t('forums.back')}</Button>}
        </div>

        {user === null ? (
          <p className="nx-subtitle">{t('community.signIn')}</p>
        ) : open === null ? (
          <>
            <div className="nx-stack">
              <TextInput
                label={t('forums.threadTitle')}
                placeholder={t('forums.threadTitle')}
                maxLength={120}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
              />
              <label className="nx-label">{t('forums.threadBody')}</label>
              <textarea
                className="nx-input"
                placeholder={t('forums.threadBody')}
                value={body}
                onChange={(event) => {
                  setBody(event.target.value);
                }}
              />
              <div className="hub-row">
                <Button variant="primary" onClick={() => void onCreate()} disabled={title.trim() === '' || body.trim() === ''}>
                  {t('forums.create')}
                </Button>
              </div>
            </div>

            {threads === null ? (
              <p className="nx-subtitle">{t('common.loading')}</p>
            ) : threads.length === 0 ? (
              <p className="nx-subtitle">{t('forums.empty')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                {threads.map((thread) => (
                  <li key={thread.id} className="hub-row hub-row--between">
                    <button
                      type="button"
                      className="hub-link"
                      onClick={() => {
                        void onOpen(thread.id);
                      }}
                    >
                      {thread.title}
                    </button>
                    <span className="hub-row">
                      <Badge>{new Intl.NumberFormat(locale).format(thread.replyCount)}</Badge>
                      {thread.locked ? <Badge tone="planned">{t('forums.closed')}</Badge> : null}
                      {mine(thread.authorId) ? (
                        <>
                          <Button onClick={() => void onLock(thread)}>
                            {thread.locked ? t('forums.reopen') : t('forums.close')}
                          </Button>
                          <Button onClick={() => void onDeleteThread(thread.id)}>{t('forums.delete')}</Button>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            <strong>{open.thread.title}</strong>
            <p className="hub-about__text">{open.thread.body}</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
              {open.items.map((post) => (
                <li key={post.id} className="nx-stack" style={{ gap: '0.15rem' }}>
                  <span className="nx-subtitle">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(post.createdAt))}
                  </span>
                  <span className="hub-about__text">{post.body}</span>
                </li>
              ))}
            </ul>
            {open.items.length === 0 ? <p className="nx-subtitle">{t('forums.noPosts')}</p> : null}

            {open.thread.locked && !mine(open.thread.authorId) ? (
              <p className="nx-subtitle">{t('forums.lockedHint')}</p>
            ) : (
              <div className="nx-stack">
                <label className="nx-label">{t('forums.reply')}</label>
                <textarea
                  className="nx-input"
                  placeholder={t('forums.reply')}
                  value={reply}
                  onChange={(event) => {
                    setReply(event.target.value);
                  }}
                />
                <div className="hub-row">
                  <Button variant="primary" onClick={() => void onReply()} disabled={reply.trim() === ''}>
                    {t('forums.send')}
                  </Button>
                  {mine(open.thread.authorId) ? (
                    <Button onClick={() => void onLock(open.thread)}>
                      {open.thread.locked ? t('forums.reopen') : t('forums.close')}
                    </Button>
                  ) : null}
                </div>
              </div>
            )}
          </>
        )}

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      </div>
    </Card>
  );
}