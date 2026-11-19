import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@nexora/ui';
import { useSiteI18n } from '../i18n/SiteI18n.js';

/** Página não encontrada — o caminho pedido não existe. */
export function NotFoundPage(): ReactNode {
  const { t } = useSiteI18n();
  return (
    <EmptyState title={t('error.notFound.title')} hint={t('error.notFound.hint')}>
      <Link to="/" style={{ textDecoration: 'none' }}>
        <span className="nx-button nx-button--primary">{t('error.notFound.back')}</span>
      </Link>
    </EmptyState>
  );
}