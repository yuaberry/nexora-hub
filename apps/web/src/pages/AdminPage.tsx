import { useEffect, useState, type ReactNode } from 'react';
import { Card, EmptyState, PlannedBadge, useInterface } from '@nexora/ui';
import * as api from '../api/library.js';

/**
 * Administração — esqueleto.
 *
 * A rota existe e a **guarda é do servidor**: sem o papel `admin`, a API
 * devolve `403`. Esconder a entrada na navegação é conveniência, não
 * segurança — e esta página nunca finge um painel que não existe.
 */
export function AdminPage(): ReactNode {
  const { t } = useInterface();
  const [overview, setOverview] = useState<{ users: number; auditEntries: number; mode: string } | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    void api
      .adminOverview()
      .then((response) => {
        setOverview(response.overview);
      })
      .catch(() => {
        setDenied(true);
      });
  }, []);

  return (
    <div className="nx-stack">
      <div className="nx-row nx-row--between">
        <h1 className="nx-title">{t('admin.title')}</h1>
        <PlannedBadge label={t('planned.badge')} />
      </div>

      {denied ? (
        <EmptyState title={t('admin.stub.forbidden')} hint={t('admin.stub.hint')} />
      ) : overview === null ? (
        <p>{t('common.loading')}</p>
      ) : (
        <Card>
          <p className="nx-subtitle">{t('admin.stub.notice')}</p>
          <p>{t('admin.stub.hint')}</p>
          <div className="nx-row">
            <span className="nx-badge">{overview.mode}</span>
            <span className="nx-badge">{overview.users}</span>
            <span className="nx-badge">{overview.auditEntries}</span>
          </div>
        </Card>
      )}
    </div>
  );
}