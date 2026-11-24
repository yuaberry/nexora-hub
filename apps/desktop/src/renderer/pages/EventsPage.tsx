import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, EmptyState, TextInput, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';
import { apiRequest } from '../lib/api.js';

/**
 * Eventos — encontros marcados pela comunidade.
 *
 * A lista mostra o que vem aí (do mais próximo para o mais distante), com os
 * confirmados e a lotação. Entrar é um botão — e quem criou pode cancelar.
 * As regras da API são as mesmas que a interface respeita: um evento cheio,
 * começado ou cancelado não mostra o botão de entrar.
 */

/** Um evento (vista do contrato). */
interface EventView {
  readonly id: string;
  readonly clanId: string | null;
  readonly title: string;
  readonly description: string;
  readonly startsAt: string;
  readonly capacity: number;
  readonly goingCount: number;
  readonly hostId: string;
  readonly cancelled: boolean;
}

/** O meu estado num evento. */
type MyStatus = 'going' | 'interested' | 'maybe' | null;

export function EventsPage(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();

  const [events, setEvents] = useState<readonly EventView[] | null>(null);
  const [mine, setMine] = useState<Readonly<Record<string, MyStatus>>>({});
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [capacity, setCapacity] = useState('6');
  const [startsAt, setStartsAt] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const list = await apiRequest<{ items: EventView[] }>('/api/v1/events');
      setEvents(list.items);
      // O meu estado em cada evento exige sessão; sem ela, a lista fica sem.
      if (user === null) {
        setMine({});
        return;
      }
      const estados: Record<string, MyStatus> = {};
      await Promise.all(
        list.items.map(async (event) => {
          try {
            const detail = await apiRequest<{ participants: { userId: string; status: string }[] }>(`/api/v1/events/${event.id}`);
            const participacao = detail.participants.find((row) => row.userId === user.id);
            estados[event.id] = (participacao?.status as MyStatus) ?? null;
          } catch {
            estados[event.id] = null;
          }
        }),
      );
      setMine(estados);
    } catch {
      setEvents([]);
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
        setMessage(error instanceof Error ? error.message : t('events.failed'));
      }
    },
    [reload, t],
  );

  const onCreate = useCallback(
    () => run(
      () => apiRequest('/api/v1/events', {
        method: 'POST',
        body: { title: title.trim(), description: description.trim(), capacity: Number(capacity), startsAt: new Date(startsAt).toISOString() },
      }),
      t('events.created'),
    ),
    [capacity, description, run, startsAt, t, title],
  );

  if (user === null) {
    return (
      <div className="nx-stack">
        <h1 className="nx-title">{t('events.title')}</h1>
        <EmptyState title={t('events.title')} hint={t('community.signIn')} />
      </div>
    );
  }

  return (
    <div className="nx-stack">
      <h1 className="nx-title">{t('events.title')}</h1>
      {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}

      <Card>
        <div className="nx-stack">
          <strong>{t('events.create')}</strong>
          <TextInput label={t('events.name')} placeholder={t('events.name')} maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} />
          <TextInput label={t('events.description')} placeholder={t('events.description')} value={description} onChange={(event) => setDescription(event.target.value)} />
          <div className="hub-row">
            <TextInput label={t('events.capacity')} type="number" min={1} max={100} value={capacity} onChange={(event) => setCapacity(event.target.value)} />
            <TextInput label={t('events.startsAt')} type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          </div>
          <div className="hub-row">
            <Button variant="primary" onClick={() => void onCreate()} disabled={title.trim() === '' || startsAt === '' || Number(capacity) < 1}>
              {t('events.create')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="nx-stack">
          <strong>{t('events.upcoming')}</strong>
          {events === null ? (
            <p className="nx-subtitle">{t('common.loading')}</p>
          ) : events.length === 0 ? (
            <p className="nx-subtitle">{t('events.empty')}</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
              {events.map((event) => {
                const meu = mine[event.id] ?? null;
                const cheio = event.goingCount >= event.capacity;
                return (
                  <li key={event.id} className="nx-stack" style={{ gap: '0.35rem' }}>
                    <div className="hub-row hub-row--between">
                      <strong>{event.title}</strong>
                      <span className="hub-row">
                        <Badge tone={cheio ? 'planned' : 'positive'}>
                          {new Intl.NumberFormat(locale).format(event.goingCount)}/{new Intl.NumberFormat(locale).format(event.capacity)}
                        </Badge>
                        {meu === null ? null : <Badge>{t(`events.status.${meu}`)}</Badge>}
                      </span>
                    </div>
                    <span className="nx-subtitle">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.startsAt))}
                    </span>
                    {event.description === '' ? null : <p className="hub-about__text">{event.description}</p>}
                    <div className="hub-row">
                      {meu === null ? (
                        <Button onClick={() => void run(() => apiRequest(`/api/v1/events/${event.id}/attendance`, { method: 'POST', body: { status: 'going' } }), t('events.joined'))} disabled={cheio}>
                          {t('events.join')}
                        </Button>
                      ) : (
                        <Button onClick={() => void run(() => apiRequest(`/api/v1/events/${event.id}/attendance`, { method: 'DELETE' }), t('events.left'))}>
                          {t('events.leave')}
                        </Button>
                      )}
                      {event.hostId === user.id ? (
                        <Button onClick={() => void run(() => apiRequest(`/api/v1/events/${event.id}/cancel`, { method: 'POST' }), t('events.cancelled'))}>
                          {t('events.cancel')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
        </div>
      </Card>
    </div>
  );
}