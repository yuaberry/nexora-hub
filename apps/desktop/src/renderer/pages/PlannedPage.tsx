import type { ReactNode } from 'react';
import { PlannedBadge, useInterface } from '@nexora/ui';

/**
 * Página dos módulos planeados.
 *
 * Existe para que a promessa seja honesta: um módulo que ainda não existe
 * aparece com o selo "Planeado" e a explicação do que falta — nunca com um
 * botão que finge funcionar.
 */
export function PlannedPage(): ReactNode {
  const { t } = useInterface();

  // Os módulos que já existem (saves na nuvem, amigos) não têm nota: uma
  // página "planeada" para algo que existe seria uma mentira. A rota fica
  // para o que vem a seguir (Remote Play).
  return <PlannedBadge label={t('planned.badge')} />;
}