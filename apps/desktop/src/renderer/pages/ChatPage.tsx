import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Card, EmptyState, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';
import type { ChatConversationView, ChatMessageView } from '../../shared/preload-api.js';

/**
 * Chat — conversas directas entre amigos.
 *
 * A conversa abre pelo amigo (a lista de conversas mostra o que há). As
 * mensagens são lidas da API, que é quem guarda o histórico — o launcher não
 * guarda conversas em disco. A página pergunta à API de tempos a tempos: o
 * *push* em tempo real pelo gateway é o passo seguinte, e até lá a
 * actualização é honesta (e visível: a data da última mensagem está sempre à
 * vista).
 */

/** Intervalo de actualização (a API é a fonte do histórico). */
const REFRESH_MS = 5_000;

/** Uma conversa aberta, com o outro lado já conhecido. */
interface OpenedConversation {
  readonly id: string;
  readonly otherName: string;
}

export function ChatPage({
  conversationWith,
}: {
  /** Identificador do amigo com quem abrir a conversa (opcional). */
  readonly conversationWith?: { userId: string; displayName: string | null; email: string };
}): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [conversations, setConversations] = useState<readonly ChatConversationView[] | null>(null);
  const [opened, setOpened] = useState<OpenedConversation | null>(null);
  const [messages, setMessages] = useState<readonly ChatMessageView[]>([]);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const signedIn = accessToken() !== null;
  const listRef = useRef<HTMLDivElement | null>(null);

  /** Abre a conversa com um amigo (reutiliza a existente). */
  const openWith = useCallback(
    async (other: { userId: string; displayName: string | null; email: string }) => {
      if (api === undefined || other.email === null) {
        setMessage(t('chat.noEmail'));
        return;
      }
      const token = accessToken() ?? '';
      const result = await api.chat.open(other.email, token);
      if (result.ok && result.id !== undefined) {
        setOpened({ id: result.id, otherName: other.displayName ?? other.email });
      } else {
        setMessage(result.message ?? t('error.generic'));
      }
    },
    [api, t],
  );

  // A conversa pedida abre-se sozinha (veio do botão "Mensagem" nos Amigos).
  useEffect(() => {
    if (conversationWith !== undefined) {
      void openWith(conversationWith);
    }
  }, [conversationWith, openWith]);

  const reloadConversations = useCallback(async () => {
    if (api === undefined || !signedIn) {
      return;
    }
    const token = accessToken() ?? '';
    const list = await api.chat.list(token);
    if (list.ok) {
      setConversations(list.items ?? []);
    }
  }, [api, signedIn]);

  const reloadMessages = useCallback(async () => {
    if (api === undefined || opened === null) {
      return;
    }
    const token = accessToken() ?? '';
    const result = await api.chat.messages(opened.id, token);
    if (result.ok) {
      setMessages(result.items ?? []);
    }
  }, [api, opened]);

  useEffect(() => {
    void reloadConversations();
  }, [reloadConversations]);

  useEffect(() => {
    void reloadMessages();
    const timer = setInterval(() => {
      void reloadMessages();
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [reloadMessages]);

  // A lista de mensagens acompanha o fim (a última nunca fica escondida).
  useEffect(() => {
    if (listRef.current !== null) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    if (api === undefined || opened === null || draft.trim() === '') {
      return;
    }
    const token = accessToken() ?? '';
    const result = await api.chat.send(opened.id, draft, token);
    if (result.ok) {
      setDraft('');
      await reloadMessages();
    } else {
      setMessage(result.message ?? t('error.generic'));
    }
  }, [api, opened, draft, reloadMessages, t]);

  const time = useMemo(
    () => (iso: string | null): string =>
      iso === null
        ? ''
        : new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)),
    [locale],
  );

  if (!signedIn) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('chat.title')}</h1>
        <EmptyState title={t('chat.signIn')} hint={t('chat.signIn.hint')} />
      </div>
    );
  }

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{t('chat.title')}</h1>
          <p className="nx-subtitle">{t('chat.subtitle')}</p>
        </div>
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <div className="hub-settings-grid">
        <Card>
          <div className="nx-stack">
            <strong>{t('chat.conversations')}</strong>
            {conversations === null || conversations.length === 0 ? (
              <p className="nx-subtitle">{t('chat.empty')}</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
                {conversations.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      className="nx-button nx-button--block"
                      onClick={() => {
                        setOpened({
                          id: conversation.id,
                          otherName: conversation.other.displayName ?? conversation.other.email ?? conversation.other.userId,
                        });
                      }}
                    >
                      <span className="hub-row hub-row--between" style={{ width: '100%' }}>
                        <span className="hub-break">
                          {conversation.other.displayName ?? conversation.other.email ?? conversation.other.userId}
                        </span>
                        <span className="nx-subtitle">{time(conversation.lastMessageAt)}</span>
                      </span>
                      <span className="nx-subtitle">
                        {conversation.lastMessageExcerpt ?? t('chat.noMessages')}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card>
          <div className="nx-stack">
            <strong>{opened === null ? t('chat.pick') : opened.otherName}</strong>
            <div
              ref={listRef}
              className="hub-chat"
              style={{ maxHeight: '18rem', overflowY: 'auto', display: 'grid', gap: '0.5rem' }}
            >
              {opened === null ? (
                <p className="nx-subtitle">{t('chat.pick.hint')}</p>
              ) : messages.length === 0 ? (
                <p className="nx-subtitle">{t('chat.noMessages')}</p>
              ) : (
                messages.map((item) => (
                  <div
                    key={item.id}
                    className={item.mine ? 'hub-chat__bubble hub-chat__bubble--mine' : 'hub-chat__bubble'}
                  >
                    {!item.mine ? (
                      <span className="nx-subtitle">{item.authorName ?? item.authorId}</span>
                    ) : null}
                    <span>{item.body}</span>
                    <span className="nx-subtitle">{time(item.createdAt)}</span>
                  </div>
                ))
              )}
            </div>
            {opened === null ? null : (
              <div className="hub-row">
                <input
                  className="nx-input"
                  value={draft}
                  placeholder={t('chat.placeholder')}
                  aria-label={t('chat.placeholder')}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void send();
                    }
                  }}
                />
                <Button
                  variant="primary"
                  onClick={() => void send()}
                  disabled={draft.trim() === ''}
                >
                  {t('chat.send')}
                </Button>
              </div>
            )}
            <span className="nx-subtitle">{t('chat.hint')}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}