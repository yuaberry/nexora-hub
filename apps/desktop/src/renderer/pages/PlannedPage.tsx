import type { ReactNode } from 'react';
import { PlannedBadge, PlannedNotice, useInterface } from '@nexora/ui';
import type { PlannedModule } from '../App.js';

/**
 * Página dos módulos planeados.
 *
 * Existe para que a promessa seja honesta: um módulo que ainda não existe
 * aparece com o selo "Planeado" e a explicação do que falta — nunca com um
 * botão que finge funcionar.
 */
export function PlannedPage({ module }: { readonly module: PlannedModule }): ReactNode {
  const { t } = useInterface();

  switch (module) {
    case 'downloads':
      return (
        <PlannedNotice badge={t('planned.badge')} title={t('nav.downloads')} hint={t('planned.downloads')} />
      );
    case 'cloudSaves':
      return (
        <PlannedNotice badge={t('planned.badge')} title={t('nav.cloudSaves')} hint={t('planned.cloud-saves')} />
      );
    case 'friends':
      return (
        <PlannedNotice badge={t('planned.badge')} title={t('nav.friends')} hint={t('planned.friends')} />
      );
    default:
      return <PlannedBadge label={t('planned.badge')} />;
  }
}