/**
 * Limites e benefícios do grupo familiar — função pura.
 *
 * Um limite anunciado é aplicado: o número de membros que o plano permite
 * vive aqui, é testado aqui, e é o servidor que recusa o convite que não
 * caberia. `null` significa **sem limite** — nunca um número gigante a fingir
 * ausência de limite.
 */

import type { HotbarPlan } from '../plans/plans.js';

/** Número máximo de membros do plano (dono incluído). */
export function maxFamilyMembers(plan: HotbarPlan): number | null {
  return plan.maxFamilyMembers;
}

/**
 * `true` quando ainda cabe mais um membro no grupo.
 *
 * Conta o dono: um grupo com limite 2 aceita o dono e mais um. A função
 * recusa entradas absurdas em vez de as deixar passar.
 */
export function canAddFamilyMember(plan: HotbarPlan, memberCount: number): boolean {
  if (!Number.isInteger(memberCount) || memberCount < 0) {
    return false;
  }
  if (plan.maxFamilyMembers === null) {
    return true;
  }
  return memberCount < plan.maxFamilyMembers;
}

/**
 * Lugares ainda livres no grupo, ou `null` quando o plano não tem limite.
 *
 * A interface mostra "Ilimitado" a partir do `null` — nunca um número
 * inventado.
 */
export function remainingFamilySlots(plan: HotbarPlan, memberCount: number): number | null {
  if (plan.maxFamilyMembers === null) {
    return null;
  }
  if (!Number.isInteger(memberCount) || memberCount < 0) {
    return plan.maxFamilyMembers;
  }
  return Math.max(0, plan.maxFamilyMembers - memberCount);
}

/** Um benefício mostrado na página da Família. */
export interface FamilyBenefitView {
  /** Chave de tradução (`family.benefit.*`). */
  readonly labelKey: string;
  /** Valor legível do benefício (número de membros, ou vazio). */
  readonly value: string;
  /** `false` quando o benefício é planeado — a interface mostra o selo. */
  readonly available: boolean;
}

/**
 * Benefícios do plano, na ordem em que a interface os mostra.
 *
 * O que existe aparece como disponível; o que ainda não existe (partilha de
 * saves na nuvem) aparece como **planeado** — com `available: false`, para a
 * interface o rotular em vez de o fingir.
 */
export function familyBenefits(plan: HotbarPlan): readonly FamilyBenefitView[] {
  const slots = maxFamilyMembers(plan);
  return [
    {
      labelKey: 'family.benefit.members',
      value: slots === null ? '∞' : String(slots),
      available: true,
    },
    {
      labelKey: 'family.benefit.sharedLibrary',
      value: '',
      available: true,
    },
    {
      labelKey: 'family.benefit.saveSharing',
      value: '',
      available: false,
    },
  ];
}