import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Badge, Button, Card, TextInput, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';
import { apiRequest } from '../lib/api.js';
import type { TranslationKey } from '@nexora/ui';

/**
 * Comunidade do jogo — comentários e reviews.
 *
 * Exige conta NEXORA: sem sessão, a secção explica o que falta em vez de
 * mostrar um formulário que vai falhar. A review é **uma por utilizador e
 * jogo** (`PUT` substitui), e o agregado é honesto — categorias sem votos
 * aparecem como `—`, nunca zero.
 */

/** Um comentário (vista do contrato). */
interface CommentView {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly body: string;
  readonly createdAt: string;
}

/** Uma review (vista do contrato). */
interface ReviewView {
  readonly id: string;
  readonly gameId: string;
  readonly userId: string;
  readonly rating: number;
  readonly story: number | null;
  readonly gameplay: number | null;
  readonly graphics: number | null;
  readonly sound: number | null;
  readonly body: string;
  readonly updatedAt: string;
}

/** Categorias da review — chaves explícitas. */
const CATEGORIES: readonly { readonly key: TranslationKey; readonly field: 'story' | 'gameplay' | 'graphics' | 'sound' }[] = [
  { key: 'community.aggregate.story', field: 'story' },
  { key: 'community.aggregate.gameplay', field: 'gameplay' },
  { key: 'community.aggregate.graphics', field: 'graphics' },
  { key: 'community.aggregate.sound', field: 'sound' },
];

export function CommunitySection({ gameId }: { readonly gameId: string }): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();
  const [comments, setComments] = useState<readonly CommentView[] | null>(null);
  const [reviews, setReviews] = useState<readonly ReviewView[] | null>(null);
  const [draft, setDraft] = useState('');
  const [myReview, setMyReview] = useState({ rating: 8, story: '', gameplay: '', graphics: '', sound: '' });
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [commentList, reviewList] = await Promise.all([
        apiRequest<{ items: CommentView[] }>(`/api/v1/comments?game=${encodeURIComponent(gameId)}`),
        apiRequest<{ items: ReviewView[] }>(`/api/v1/reviews?game=${encodeURIComponent(gameId)}`),
      ]);
      setComments(commentList.items);
      setReviews(reviewList.items);
    } catch {
      setComments([]);
      setReviews([]);
    }
  }, [gameId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const myOwn = useMemo(
    () => (user === null ? null : reviews?.find((item) => item.userId === user.id) ?? null),
    [reviews, user],
  );

  const onComment = useCallback(async () => {
    if (draft.trim() === '') {
      return;
    }
    try {
      const created = await apiRequest<CommentView>(`/api/v1/comments?game=${encodeURIComponent(gameId)}`, {
        method: 'POST',
        body: { body: draft.trim() },
      });
      setDraft('');
      setComments((current) => [created, ...(current ?? [])]);
      setMessage(t('community.comment.created'));
    } catch {
      setMessage(t('community.comment.error'));
    }
  }, [draft, gameId, t]);

  const onReview = useCallback(async () => {
    const optional = (value: string): number | null => (value.trim() === '' ? null : Number(value));
    try {
      await apiRequest<ReviewView>(`/api/v1/reviews/me?game=${encodeURIComponent(gameId)}`, {
        method: 'PUT',
        body: {
          rating: myReview.rating,
          story: optional(myReview.story),
          gameplay: optional(myReview.gameplay),
          graphics: optional(myReview.graphics),
          sound: optional(myReview.sound),
        },
      });
      setMessage(t('community.review.saved'));
      await reload();
    } catch {
      setMessage(t('community.review.error'));
    }
  }, [gameId, myReview, reload, t]);

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('community.title')}</strong>
          {user === null ? <Badge tone="planned">{t('auth.account')}</Badge> : null}
        </div>

        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
        {user === null ? <p className="nx-subtitle">{t('community.signInRequired')}</p> : null}

        <strong>{t('community.reviews')}</strong>
        {reviews === null ? (
          <p className="nx-subtitle">{t('common.loading')}</p>
        ) : reviews.length === 0 ? (
          <p className="nx-subtitle">{t('community.reviews.empty')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
            {reviews.map((review) => (
              <li key={review.id} className="nx-stack">
                <div className="hub-row">
                  <Badge tone="positive">{formatScore(review.rating, locale)}</Badge>
                  <span className="nx-subtitle">{review.userId}</span>
                </div>
                <div className="hub-suggestions">
                  {CATEGORIES.map((category) => (
                    <span key={category.key} className="nx-subtitle">
                      {t(category.key)}: {formatScore(review[category.field], locale)}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}

        {user === null ? null : (
          <div className="nx-stack">
            <TextInput
              label={t('community.review.rating')}
              type="number"
              min={1}
              max={10}
              value={String(myReview.rating)}
              onChange={(event) => {
                setMyReview({ ...myReview, rating: Number(event.target.value) });
              }}
            />
            <div className="hub-settings-grid">
              {CATEGORIES.map((category) => (
                <TextInput
                  key={category.key}
                  label={t(category.key)}
                  type="number"
                  min={1}
                  max={10}
                  value={myReview[category.field]}
                  onChange={(event) => {
                    setMyReview({ ...myReview, [category.field]: event.target.value });
                  }}
                />
              ))}
            </div>
            <Button
              variant="primary"
              onClick={() => {
                void onReview();
              }}
            >
              {myOwn === null ? t('community.review.submit') : t('community.review.update')}
            </Button>
          </div>
        )}

        <strong>{t('community.comments')}</strong>
        {user === null ? null : (
          <div className="nx-stack">
            <TextInput
              label={t('community.comment.placeholder')}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
              }}
            />
            <Button
              variant="primary"
              onClick={() => {
                void onComment();
              }}
            >
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
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * Formata uma nota: `—` quando não há votos.
 *
 * Uma categoria sem votos não é zero — é desconhecida, e a interface diz a
 * verdade em vez de inventar um número.
 */
function formatScore(value: number | null, locale: string): string {
  if (value === null) {
    return '—';
  }
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
}