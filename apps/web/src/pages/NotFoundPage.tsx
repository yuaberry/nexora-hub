import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, useInterface } from '@nexora/ui';

/**
 * 404 — a SPA resolve o caminho, e um caminho que não existe diz isso.
 */
export function NotFoundPage(): ReactNode {
  const { t } = useInterface();
  return (
    <EmptyState title={t('error.notFound.title')} hint={t('error.notFound.hint')}>
      <Link to="/biblioteca">{t('nav.library')}</Link>
    </EmptyState>
  );
}