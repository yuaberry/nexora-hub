import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LIMIT,
  MAX_LIMIT,
  errorEnvelope,
  gatewayEvent,
  pageMeta,
  PLANNED_MODULES,
  PLANNED_REASONS,
  plannedAvailability,
} from '../src/index.js';
import type { ErrorCode } from '../src/index.js';

describe('envelope de erro', () => {
  it('tem sempre o requestId', () => {
    const envelope = errorEnvelope('not_found', 'Recurso não encontrado.', 'req-1');
    expect(envelope.error.requestId).toBe('req-1');
    expect(envelope.error.code).toBe('not_found');
  });

  it('omite details quando não há', () => {
    expect('details' in errorEnvelope('forbidden', 'Sem permissão.', 'req-2').error).toBe(false);
  });

  it('leva details do cliente quando existem', () => {
    const envelope = errorEnvelope('invalid_request', 'Payload inválido.', 'req-3', [
      { path: 'limit', message: 'inteiro', code: 'invalid_value' },
    ]);
    expect(envelope.error.details).toHaveLength(1);
  });

  it('cobre todos os códigos que a API emite', () => {
    const codes: ErrorCode[] = [
      'invalid_request',
      'unauthenticated',
      'forbidden',
      'mfa_required',
      'not_found',
      'conflict',
      'capacity_unavailable',
      'account_locked',
      'rate_limited',
      'service_unavailable',
      'internal_error',
    ];
    for (const code of codes) {
      expect(errorEnvelope(code, 'msg', 'req').error.code).toBe(code);
    }
  });
});

describe('paginação', () => {
  it('declara limites estáveis', () => {
    expect(MAX_LIMIT).toBe(100);
    expect(DEFAULT_LIMIT).toBe(50);
  });

  it('monta o bloco page', () => {
    expect(pageMeta(7, { limit: 10, offset: 0 })).toEqual({ limit: 10, offset: 0, total: 7 });
  });
});

describe('módulos planeados', () => {
  it('todos têm razão declarada', () => {
    for (const module of PLANNED_MODULES) {
      expect(PLANNED_REASONS[module]).toBeTruthy();
    }
  });

  it('a disponibilidade planeada nunca finge funcionar', () => {
    const availability = plannedAvailability('store');
    expect(availability.status).toBe('planned');
    expect(availability.reason).toContain('NEXORA');
  });
});

describe('gateway de tempo real', () => {
  it('monta o envelope com data ISO', () => {
    const event = gatewayEvent('presence.update', { userId: 'u1' }, { at: new Date(0) });
    expect(event.at).toBe('1970-01-01T00:00:00.000Z');
    expect(event.userId).toBeNull();
    expect(event.type).toBe('presence.update');
  });
});