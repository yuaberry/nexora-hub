import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge, Card, useInterface } from '@nexora/ui';
import { useAuth } from '../state/auth.js';
import { apiRequest } from '../lib/api.js';

/**
 * Reputação — os níveis a partir dos pontos reais.
 *
 * Não há númeroInventado: a reputação lê o saldo de pontos do utilizador e
 * aplica os limiares do domínio. A barra mostra o progresso até ao próximo
 * nível — e no nível máximo diz esse, sem fingir um objectivo que não existe.
 */
export function ReputationCard(): ReactNode {
  const { t, locale } = useInterface();
  const { user } = useAuth();
  const [rep, setRep] = useState<{ points: number; level: string; next: string | null; fraction: number; remaining: number } | null>(null);

  const reload = useCallback(async () => {
    if (user === null) {
      return;
    }
    try {
      setRep(await apiRequest('/api/v1/reputation'));
    } catch {
      setRep(null);
    }
  }, [user]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (user === null || rep === null) {
    return null;
  }

  return (
    <Card>
      <div className="nx-stack">
        <div className="hub-row hub-row--between">
          <strong>{t('reputation.title')}</strong>
          <Badge tone="positive">{t(rep.level as 'reputation.level.bronze')}</Badge>
        </div>
        <span className="hub-row">
          <span style={{ flex: 1 }}>
            <span
              className="hub-progress"
              style={{ width: `${Math.round(rep.fraction * 100)}%` }}
              role="progressbar"
              aria-valuenow={Math.round(rep.fraction * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </span>
          <span className="nx-subtitle">
            {new Intl.NumberFormat(locale).format(rep.points)}
          </span>
        </span>
        <span className="nx-subtitle">
          {rep.next === null
            ? t('reputation.max')
            : t('reputation.next', { remaining: new Intl.NumberFormat(locale).format(rep.remaining), level: t(rep.next as 'reputation.level.silver') })}
        </span>
      </div>
    </Card>
  );
}
