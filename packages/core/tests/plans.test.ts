import { describe, expect, it } from 'vitest';
import {
  FREE_PLAN,
  PLANS,
  PREMIUM_PLAN,
  isWithinPlan,
  planById,
  remainingHotbars,
} from '../src/plans/plans.js';

describe('planos', () => {
  it('declara o limite free (6) e o ilimitado premium', () => {
    expect(FREE_PLAN.maxHotbars).toBe(6);
    expect(PREMIUM_PLAN.maxHotbars).toBeNull();
    expect(PLANS).toHaveLength(2);
  });

  it('free aceita até seis hotbars e recusa a sétima', () => {
    expect(isWithinPlan(FREE_PLAN, 6)).toBe(true);
    expect(isWithinPlan(FREE_PLAN, 7)).toBe(false);
    expect(isWithinPlan(FREE_PLAN, 0)).toBe(true);
  });

  it('premium aceita qualquer quantidade — null é sem limite', () => {
    expect(isWithinPlan(PREMIUM_PLAN, 6)).toBe(true);
    expect(isWithinPlan(PREMIUM_PLAN, 500)).toBe(true);
  });

  it('recusa entradas inválidas', () => {
    expect(isWithinPlan(FREE_PLAN, -1)).toBe(false);
    expect(isWithinPlan(FREE_PLAN, Number.NaN)).toBe(false);
    expect(isWithinPlan(FREE_PLAN, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('calcula as hotbars restantes; null quando ilimitado', () => {
    expect(remainingHotbars(FREE_PLAN, 3)).toBe(3);
    expect(remainingHotbars(FREE_PLAN, 6)).toBe(0);
    expect(remainingHotbars(FREE_PLAN, 9)).toBe(0);
    expect(remainingHotbars(PREMIUM_PLAN, 9)).toBeNull();
  });

  it('encontra um plano pelo identificador', () => {
    expect(planById('premium')).toBe(PREMIUM_PLAN);
    expect(planById('inexistente')).toBeUndefined();
  });

  it('declara o limite de membros da família (free 2, premium 6)', () => {
    expect(FREE_PLAN.maxFamilyMembers).toBe(2);
    expect(PREMIUM_PLAN.maxFamilyMembers).toBe(6);
  });
});