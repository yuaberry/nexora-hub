import { describe, expect, it } from 'vitest';
import {
  canCancel,
  canJoin,
  hasStarted,
  isCapacityValid,
  MAX_EVENT_CAPACITY,
  type CommunityEvent,
} from '../../src/community/events.js';

/**
 * Eventos — as regras da participação.
 */
function evento(overrides: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    id: 'e1',
    clanId: null,
    title: 'Noite de R.E.P.O.',
    description: 'Extrair até cair.',
    startsAt: '2026-11-30T20:00:00.000Z',
    capacity: 6,
    hostId: 'anfitriao',
    goingCount: 2,
    cancelled: false,
    createdAt: '2026-11-24T10:00:00.000Z',
    ...overrides,
  };
}

describe('canJoin', () => {
  it('entra quem tem lugar e o evento não começou', () => {
    expect(canJoin(evento(), '2026-11-24T10:00:00.000Z')).toBe(true);
  });

  it('um evento cheio não aceita entradas', () => {
    expect(canJoin(evento({ goingCount: 6 }), '2026-11-24T10:00:00.000Z')).toBe(false);
  });

  it('um evento que já começou não aceita entradas', () => {
    expect(canJoin(evento(), '2026-12-01T10:00:00.000Z')).toBe(false);
  });

  it('um evento cancelado não aceita entradas', () => {
    expect(canJoin(evento({ cancelled: true }), '2026-11-24T10:00:00.000Z')).toBe(false);
  });
});

describe('canCancel', () => {
  it('só quem criou cancela, e uma vez só', () => {
    expect(canCancel(evento(), 'anfitriao')).toBe(true);
    expect(canCancel(evento(), 'outro')).toBe(false);
    expect(canCancel(evento({ cancelled: true }), 'anfitriao')).toBe(false);
  });
});

describe('hasStarted', () => {
  it('a comparação é declarada', () => {
    expect(hasStarted(evento(), '2026-11-24T10:00:00.000Z')).toBe(false);
    expect(hasStarted(evento(), '2026-11-30T20:00:00.001Z')).toBe(true);
  });
});

describe('isCapacityValid', () => {
  it('a lotação é um inteiro entre 1 e o limite', () => {
    expect(isCapacityValid(1)).toBe(true);
    expect(isCapacityValid(MAX_EVENT_CAPACITY)).toBe(true);
    expect(isCapacityValid(0)).toBe(false);
    expect(isCapacityValid(MAX_EVENT_CAPACITY + 1)).toBe(false);
    expect(isCapacityValid(2.5)).toBe(false);
  });
});
