import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.js';
import type { TranslationKey } from '@nexora/ui';
import { Badge, Button, Card, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import { accessToken } from '../api/client.js';
import * as community from '../api/community.js';
import type { Comment, Review } from '../api/community.js';

/**
 * Detalhes do jogo na web — a comunidade, na íntegra.
 *
 * Comentários e reviews vivem na API (onde as contas existem). A review é
 * uma por utilizador: o formulário carrega a review própria quando existe. O
 * agregado é honesto — categorias sem votos aparecem como `—`, nunca zero.
 */
export function GameDetailPage(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();
  const params = useParams<{ gameId: string }>();
  const gameId = params.gameId ?? '';

  const [comments, setComments] = useState<readonly Comment[] | null>(null);
  const [reviewData, setReviewData] = useState<{ items: readonly Review[]; aggregate: community.ReviewAggregate } | null>(null);
  const [draft, setDraft] = useState('');
  const [myReview, setMyReview] = useState<ReviewDraft>({
    rating: 8,
    story: '',
    gameplay: '',
    graphics: '',
    sound: '',
  });
  const [message, setMessage] = useState<string | null>(null);

  const signedIn = accessToken() !== null;

  const reload = useCallback(async () => {
    if (gameId === '') {
      return;
    }
    const [commentList, reviewList] = await Promise.all([community.comments(gameId), community.reviews(gameId)]);
    setComments(commentList.items);
    setReviewData(reviewList);
  }, [gameId]);

  useEffect(() => {
    void reload().catch((cause: unknown) => {
      setMessage(cause instanceof Error ? cause.message : t('error.generic'));
    });
  }, [reload, t]);

  // A review própria é a do utilizador em sessão — não uma marcada à mão.
  const myOwn = useMemo(
    () => (user === null ? null : reviewData?.items.find((item) => item.userId === user.id) ?? null),
    [reviewData, user],
  );

  const onComment = useCallback(async () => {
    if (draft.trim() === '') {
      return;
    }
    const created = await community.createComment(gameId, draft.trim());
    setDraft('');
    setMessage(t('community.comment.created'));
    setComments((current) => [created, ...(current ?? [])]);
  }, [draft, gameId, t]);

  const onDeleteComment = useCallback(async (commentId: string) => {
    await community.deleteComment(commentId);
    setComments((current) => (current ?? []).filter((item) => item.id !== commentId));
    setMessage(t('community.comment.removed'));
  }, [t]);

  const onReview = useCallback(async () => {
    const optional = (value: string): number | null => (value.trim() === '' ? null : Number(value));
    await community.upsertReview(gameId, {
      rating: myReview.rating,
      story: optional(myReview.story),
      gameplay: optional(myReview.gameplay),
      graphics: optional(myReview.graphics),
      sound: optional(myReview.sound),
    });
    setMessage(t('community.review.saved'));
    await reload();
  }, [gameId, myReview, reload, t]);

  const aggregate = reviewData?.aggregate;

  return (
    <div className="nx-stack">
      <div className="hub-row hub-row--between">
        <div className="nx-stack">
          <h1 className="nx-title">{gameId}</h1>
          <p className="nx-subtitle">{t('community.subtitle')}</p>
        </div>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
      {!signedIn ? (
        <EmptyState title={t('community.signIn')} hint={t('community.signIn.hint')} />
      ) : null}

      <Card>
        <div className="nx-stack">
          <strong>{t('community.reviews')}</strong>
          {aggregate === undefined ? (
            <p className="nx-subtitle">{t('common.loading')}</p>
          ) : aggregate.count === 0 ? (
            <p className="nx-subtitle">{t('community.reviews.empty')}</p>
          ) : (
            <div className="hub-row">
              <Badge tone="positive">
                {t('community.aggregate.average')}: {formatScore(aggregate.averageRating, locale)}
              </Badge>
              <span className="nx-subtitle">
                {t('community.aggregate.count')}: {aggregate.count}
              </span>
              <span className="nx-subtitle">
                {t('community.aggregate.story')}: {formatScore(aggregate.averageStory, locale)}
              </span>
              <span className="nx-subtitle">
                {t('community.aggregate.gameplay')}: {formatScore(aggregate.averageGameplay, locale)}
              </span>
              <span className="nx-subtitle">
                {t('community.aggregate.graphics')}: {formatScore(aggregate.averageGraphics, locale)}
              </span>
              <span className="nx-subtitle">
                {t('community.aggregate.sound')}: {formatScore(aggregate.averageSound, locale)}
              </span>
            </div>
          )}

          {!signedIn ? null : (
            <div className="nx-stack">
              <label className="nx-stack">
                <span className="nx-label">{t('community.review.rating')}</span>
                <input
                  className="nx-input"
                  type="number"
                  min={1}
                  max={10}
                  value={myReview.rating}
                  onChange={(event) => {
                    setMyReview({ ...myReview, rating: Number(event.target.value) });
                  }}
                />
              </label>
              <div className="hub-settings-grid">
                {CATEGORIES.map((category) => (
                  <label key={category.key} className="nx-stack">
                    <span className="nx-label">{t(category.key)}</span>
                    <input
                      className="nx-input"
                      type="number"
                      min={1}
                      max={10}
                      value={myReview[category.field]}
                      onChange={(event) => {
                        setMyReview(updateField(myReview, category.field, event.target.value));
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="hub-row">
                <Button variant="primary" onClick={() => void onReview()}>
                  {myOwn === null ? t('community.review.submit') : t('community.review.update')}
                </Button>
                {myOwn === null ? null : (
                  <Button
                    variant="danger"
                    onClick={() => {
                      void community.deleteReview(myOwn.id).then(() => {
                        setMessage(t('community.review.removed'));
                        return reload();
                      });
                    }}
                  >
                    {t('community.review.remove')}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('community.comments')}</strong>
          {!signedIn ? null : (
            <div className="nx-stack">
              <label className="nx-stack">
                <span className="nx-label">{t('community.comment.placeholder')}</span>
                <input
                  className="nx-input"
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                  }}
                />
              </label>
              <Button variant="primary" onClick={() => void onComment()}>
                {t('community.comment.submit')}
              </Button>
            </div>
          )}

          {comments === null ? (
            <p className="nx-subtitle">{t('common.loading')}</p>
          ) : comments.length === 0 ? (
            <p className="nx-subtitle">{t('community.comments.empty')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {comments.map((comment) => (
                <li key={comment.id} className="nx-stack">
                  <strong className="hub-break">{comment.userId}</strong>
                  <span>{comment.body}</span>
                  <span className="nx-subtitle">
                    {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(comment.createdAt))}
                  </span>
                  {user === null || comment.userId !== user.id ? null : (
                    <div className="hub-row">
                      <Button onClick={() => void onDeleteComment(comment.id)}>{t('community.comment.remove')}</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

/**
 * Formata uma nota: `—` quando não há votos.
 *
 * Uma categoria sem votos não é zero — é desconhecida, e a interface diz a
 /** Rascunho da review propria (vazio = categoria nao votada). */
interface ReviewDraft {
  rating: number;
  story: string;
  gameplay: string;
  graphics: string;
  sound: string;
}

/** Campo de categoria do rascunho. */
type ReviewField = 'story' | 'gameplay' | 'graphics' | 'sound';

/**
 * Actualiza um campo do rascunho.
 *
 * Funcao explicita em vez de `{ ...draft, [field]: value }`: uma chave
 * computada com uniao de chaves nao e verificavel pelo TypeScript, e o
 * resultado seria um `any` disfarcado.
 */
function updateField(draft: ReviewDraft, field: ReviewField, value: string): ReviewDraft {
  const next = { ...draft };
  next[field] = value;
  return next;
}

/**
 * Categorias da review — chaves **explícitas**, nunca construídas por
 * concatenação (o tipo do dicionário não as consegue validar).
 */
const CATEGORIES: readonly { readonly key: TranslationKey; readonly field: ReviewField }[] = [
  { key: 'community.aggregate.story', field: 'story' },
  { key: 'community.aggregate.gameplay', field: 'gameplay' },
  { key: 'community.aggregate.graphics', field: 'graphics' },
  { key: 'community.aggregate.sound', field: 'sound' },
];

function formatScore(value: number | null, locale: string): string {
  if (value === null) {
    return '—';
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}