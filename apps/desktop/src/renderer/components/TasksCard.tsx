import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Button, Card, useInterface } from '@nexora/ui';
import { accessToken } from '../lib/api.js';

/**
 * Tarefas — desafios por período, com pontos reais.
 *
 * As medidas são as sessões do utilizador (jogar, lançar, variar de jogo) e o
 * prémio sai pela mesma trilha das conquistas. Sem sessão, o cartão diz o que
 * falta — nunca um botão que reclama o que não existe.
 */

/** Uma tarefa (vista do contrato). */
interface TaskView {
  readonly id: string;
  readonly cadence: 'daily' | 'weekly';
  readonly metric: 'play-seconds' | 'games-launched' | 'distinct-games';
  readonly target: number;
  readonly reward: number;
  readonly value: number;
  readonly complete: boolean;
  readonly fraction: number;
  readonly claimed: boolean;
}

/** O nome de uma tarefa (chave explícita, não dinâmica). */
const NAME_KEYS: Record<string, 'task.dailyPlay.name' | 'task.dailyLaunch.name' | 'task.weeklyDistinct.name'> = {
  'daily-play': 'task.dailyPlay.name',
  'daily-launch': 'task.dailyLaunch.name',
  'weekly-distinct': 'task.weeklyDistinct.name',
};

export function TasksCard(): ReactNode {
  const { t, locale } = useInterface();
  const api = globalThis.window?.nexora;

  const [tasks, setTasks] = useState<readonly TaskView[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const token = accessToken();
    if (api === undefined || token === null) {
      setTasks(null);
      return;
    }
    try {
      const result = await api.tasks.list(token);
      setTasks(result.items);
    } catch {
      setTasks([]);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onClaim = useCallback(
    async (taskId: string) => {
      const token = accessToken();
      if (api === undefined || token === null) {
        return;
      }
      try {
        const result = await api.tasks.claim(taskId, token);
        setMessage(result.ok ? t('task.claimed', { points: result.awarded ?? 0 }) : t('task.claimFailed'));
        await reload();
      } catch {
        setMessage(t('task.claimFailed'));
      }
    },
    [api, reload, t],
  );

  if (accessToken() === null) {
    return (
      <Card>
        <div className="nx-stack">
          <strong>{t('task.title')}</strong>
          <p className="nx-subtitle">{t('community.signIn')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('task.title')}</strong>
          <Badge tone="planned">
            {(tasks ?? []).filter((task) => task.complete && !task.claimed).length}
          </Badge>
        </div>
        {message === null ? null : <p className="nx-banner"><span>{message}</span></p>}
        {tasks === null ? (
          <p className="nx-subtitle">{t('common.loading')}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
            {tasks.map((task) => (
              <li key={task.id} className="nx-stack" style={{ gap: '0.3rem' }}>
                <div className="hub-row hub-row--between">
                  <span>{t(NAME_KEYS[task.id] ?? 'task.title')}</span>
                  <span className="hub-row">
                    <Badge tone={task.cadence === 'daily' ? 'neutral' : 'positive'}>
                      {t(task.cadence === 'daily' ? 'task.cadence.daily' : 'task.cadence.weekly')}
                    </Badge>
                    <Badge tone="neutral">
                      +{new Intl.NumberFormat(locale).format(task.reward)}
                    </Badge>
                  </span>
                </div>
                <span className="hub-progress" style={{ width: `${Math.round(task.fraction * 100)}%` }} />
                <div className="hub-row hub-row--between">
                  <span className="nx-subtitle">
                    {new Intl.NumberFormat(locale).format(task.value)} / {new Intl.NumberFormat(locale).format(task.target)}
                  </span>
                  {task.claimed ? (
                    <Badge tone="positive">{t('task.done')}</Badge>
                  ) : (
                    <Button onClick={() => void onClaim(task.id)} disabled={!task.complete}>
                      {t('task.claim')}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
