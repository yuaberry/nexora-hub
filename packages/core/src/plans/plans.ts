/**
 * Limites de plano — função pura.
 *
 * O limite de hotbars do plano **free** (6) e do **premium** (ilimitado) é
 * regra de domínio: vive aqui, é testado aqui e é aplicado pelo servidor
 * quando os planos entrarem em vigor. `null` significa **sem limite** — nunca
 * um número gigante a fingir ausência de limite.
 *
 * Nesta fase o valor é apenas declarado (a interface mostra-o): aplicar o
 * limite no servidor é a fase dos planos.
 */

/** Um plano e os seus limites. */
export interface HotbarPlan {
  readonly id: string;
  /** Chave de tradução do nome do plano (`plans.<id>`). */
  readonly labelKey: string;
  /** Número máximo de hotbars; `null` = ilimitado. */
  readonly maxHotbars: number | null;
  /**
   * Número máximo de membros do grupo familiar (dono incluído).
   *
   * O limite é aplicado pelo **servidor** quando um convite é aceite — a
   * interface mostra o que o plano dá, e a API recusa o que ele não dá.
   */
  readonly maxFamilyMembers: number | null;
}

/** Plano gratuito: seis hotbars e grupo familiar até dois membros. */
export const FREE_PLAN: HotbarPlan = {
  id: 'free',
  labelKey: 'free',
  maxHotbars: 6,
  maxFamilyMembers: 2,
};

/** Plano premium: hotbars ilimitadas e grupo familiar até seis membros. */
export const PREMIUM_PLAN: HotbarPlan = {
  id: 'premium',
  labelKey: 'premium',
  maxHotbars: null,
  maxFamilyMembers: 6,
};

/** Catálogo de planos (a fonte de verdade dos limites). */
export const PLANS: readonly HotbarPlan[] = [FREE_PLAN, PREMIUM_PLAN];

/**
 * `true` quando a quantidade pedida cabe no plano.
 *
 * Um plano ilimitado aceita qualquer quantidade — incluindo zero e valores
 * absurdamente grandes, porque não há limite a violar.
 */
export function isWithinPlan(plan: HotbarPlan, hotbars: number): boolean {
  if (!Number.isFinite(hotbars) || hotbars < 0) {
    return false;
  }
  if (plan.maxHotbars === null) {
    return true;
  }
  return hotbars <= plan.maxHotbars;
}

/**
 * Quantidade de hotbars ainda disponível no plano.
 *
 * `null` quando o plano não tem limite — a interface mostra "Ilimitado" a
 * partir do `null`, nunca um número inventado.
 */
export function remainingHotbars(plan: HotbarPlan, used: number): number | null {
  if (plan.maxHotbars === null) {
    return null;
  }
  if (!Number.isFinite(used) || used < 0) {
    return plan.maxHotbars;
  }
  return Math.max(0, plan.maxHotbars - used);
}

/** Plano por identificador (`undefined` quando não existe). */
export function planById(id: string): HotbarPlan | undefined {
  return PLANS.find((plan) => plan.id === id);
}