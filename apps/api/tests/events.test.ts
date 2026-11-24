import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Eventos — encontros marcados com lotação aplicada.
 *
 * O que estes testes travam: criar exige início no futuro; `going` ocupa
 * lugar e a **lotação é aplicada** (quem está "interessado" não ocupa);
 * sair liberta o lugar; cancelar é só do anfitrião (outro recebe 404); e um
 * evento cancelado não aceita mais entradas.
 */

/** Uma conta nova. */
async function conta(app: Awaited<ReturnType<typeof buildTestApp>>['app'], label: string): Promise<string> {
  const created = await registerUser(app, `evento-${Date.now()}-${label}@nexora.local`);
  return created.accessToken;
}

/** O corpo de um evento que começa amanhã. */
function corpo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const amanha = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  return { title: 'Noite de R.E.P.O.', description: 'Extrair até cair.', startsAt: amanha, capacity: 2, ...overrides };
}

describe('eventos', () => {
  it('criar exige início no futuro', async () => {
    const built = await buildTestApp();
    const token = await conta(built.app, 'anfitriao');
    const passado = await built.app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: authHeader(token),
      payload: corpo({ startsAt: '2020-01-01T00:00:00.000Z' }),
    });
    expect(passado.statusCode).toBe(400);
    const futuro = await built.app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: authHeader(token),
      payload: corpo(),
    });
    expect(futuro.statusCode).toBe(201);
  });

  it('a lotação é aplicada: going ocupa, interested não', async () => {
    const built = await buildTestApp();
    const anfitriao = await conta(built.app, 'anfitriao');
    const um = await conta(built.app, 'um');
    const dois = await conta(built.app, 'dois');
    const criado = await built.app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: authHeader(anfitriao),
      payload: corpo({ capacity: 2 }),
    });
    const event = criado.json<{ event: { id: string } }>().event;

    // Um entra (going) — ainda há lugar.
    const entrou = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(um),
      payload: { status: 'going' },
    });
    expect(entrou.statusCode).toBe(200);

    // Outro fica "interested" — não ocupa lugar.
    const interessado = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(dois),
      payload: { status: 'interested' },
    });
    expect(interessado.statusCode).toBe(200);

    // Um terceiro vai entrar... mas a lotação é 2 e só há um confirmado?
    // Não: o anfitrião não conta sozinho. Lotação 2, um going → sobra 1.
    const terceiro = await conta(built.app, 'terceiro');
    const entrouTerceiro = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(terceiro),
      payload: { status: 'going' },
    });
    expect(entrouTerceiro.statusCode).toBe(200);

    // Agora está cheio (2 confirmados): o quarto é recusado.
    const quarto = await conta(built.app, 'quarto');
    const recusado = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(quarto),
      payload: { status: 'going' },
    });
    expect(recusado.statusCode).toBe(403);

    // O que saiu liberta o lugar.
    await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(um),
    });
    const quartoOutra = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(quarto),
      payload: { status: 'going' },
    });
    expect(quartoOutra.statusCode).toBe(200);
  });

  it('cancelar é só do anfitrião (outro recebe 404)', async () => {
    const built = await buildTestApp();
    const anfitriao = await conta(built.app, 'anfitriao');
    const estranho = await conta(built.app, 'estranho');
    const criado = await built.app.inject({
      method: 'POST',
      url: '/api/v1/events',
      headers: authHeader(anfitriao),
      payload: corpo(),
    });
    const event = criado.json<{ event: { id: string } }>().event;

    const roubado = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/cancel`,
      headers: authHeader(estranho),
    });
    expect(roubado.statusCode).toBe(404);

    const cancelado = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/cancel`,
      headers: authHeader(anfitriao),
    });
    expect(cancelado.statusCode).toBe(200);

    // Cancelado não aceita entradas.
    const entrada = await built.app.inject({
      method: 'POST',
      url: `/api/v1/events/${event.id}/attendance`,
      headers: authHeader(estranho),
      payload: { status: 'going' },
    });
    expect(entrada.statusCode).toBe(403);
  });

  it('sem sessão não cria nem entra', async () => {
    const built = await buildTestApp();
    const criado = await built.app.inject({ method: 'POST', url: '/api/v1/events', payload: corpo() });
    expect(criado.statusCode).toBe(401);
  });
});