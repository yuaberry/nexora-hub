import { describe, expect, it } from 'vitest';
import { buildTestApp } from './helpers.js';
import { fastifyClientError } from '../src/plugins/errorHandler.js';

/**
 * Envelope de erro — e a regra de que **um erro do cliente nunca sai como
 * `500`**.
 *
 * JSON malformado, média type recusado, corpo vazio com `Content-Type:
 * application/json` e paginação inválida são erros do **pedido**: devolvem
 * `4xx` com o envelope do contrato, nunca `500`.
 */
describe('erros do pedido', () => {
  it('JSON malformado dá 400 com o envelope do contrato', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '{isto não é json',
    });
    expect(response.statusCode).toBe(400);
    const body = response.json() as { error: { code: string; message: string; requestId: string } };
    expect(body.error.code).toBe('invalid_request');
    expect(body.error.message).toBe('Payload inválido.');
    expect(body.error.requestId).toBeTruthy();
    await app.close();
  });

  it('corpo vazio com Content-Type JSON dá 400, não 500', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: { code: string } }).error.code).toBe('invalid_request');
    await app.close();
  });

  it('paginação inválida dá 400 com o caminho do campo', async () => {
    const { app } = await buildTestApp();
    const { registerUser } = await import('./fixtures.js');
    const user = await registerUser(app, 'paginacao@nexora.local');

    for (const query of ['limit=101', 'limit=abc', 'offset=-1', 'offset=1.5']) {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/sessions?${query}`,
        headers: { authorization: `Bearer ${user.accessToken}` },
      });
      expect(response.statusCode).toBe(400);
      const body = response.json() as { error: { code: string; details: Array<{ path: string }> } };
      expect(body.error.code).toBe('invalid_request');
      expect(['limit', 'offset']).toContain(body.error.details[0]?.path);
    }
    await app.close();
  });

  it('rota inexistente dá 404 com o envelope do contrato', async () => {
    const { app } = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/nao-existe' });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: { code: string } }).error.code).toBe('not_found');
    await app.close();
  });
});

describe('fastifyClientError', () => {
  it('reclassifica erros do Fastify em 4xx', () => {
    expect(fastifyClientError({ code: 'FST_ERR_CTP_EMPTY_JSON_BODY', statusCode: 400 })).toEqual({
      statusCode: 400,
      code: 'invalid_request',
      message: 'Payload inválido.',
    });
    expect(fastifyClientError({ code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE', statusCode: 415 })?.code).toBe(
      'invalid_request',
    );
    expect(fastifyClientError({ code: 'FST_ERR_CTP_PAYLOAD_TOO_LARGE', statusCode: 413 })?.code).toBe(
      'invalid_request',
    );
  });

  it('não reclassifica um erro interno que traga statusCode', () => {
    expect(fastifyClientError({ code: 'ERR_INTERNO', statusCode: 400 })).toBeUndefined();
    expect(fastifyClientError({ code: 'FST_ERR_QUALQUER', statusCode: 500 })).toBeUndefined();
    expect(fastifyClientError(null)).toBeUndefined();
    expect(fastifyClientError('erro')).toBeUndefined();
  });
});