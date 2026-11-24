import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Fóruns de jogo — tópicos e respostas.
 *
 * O que estes testes travam: criar um tópico exige sessão; uma **resposta
 * faz o tópico subir** (a última actividade muda e a contagem sobe); um
 * tópico **fechado** só aceita resposta do autor; e fechar ou apagar o
 * recurso de outro utilizador devolve **404**, nunca 403.
 */

describe('fóruns', () => {
  it('cria um tópico, responde, e a resposta faz o tópico subir', async () => {
    const built = await buildTestApp();
    const token = await (async () => {
      const created = await registerUser(built.app, `forum-${Date.now()}-a@nexora.local`);
      return created.accessToken;
    })();
    const game = `/games/hollow-knight`;
    const headers = { ...authHeader(token) };

    const created = await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads?game=${encodeURIComponent(game)}`,
      headers,
      payload: { title: 'Como derrotar o terceiro boss?', body: 'Estou preso há horas.' },
    });
    expect(created.statusCode).toBe(201);
    const thread = created.json<{ id: string; replyCount: number; lastActivityAt: string }>();
    expect(thread.replyCount).toBe(0);

    // Um segundo tópico, criado depois, começa acima (actividade igual ou maior).
    await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads?game=${encodeURIComponent(game)}`,
      headers,
      payload: { title: 'Melhor amuleto?', body: 'Qual amuleto recomendam?' },
    });

    // Responder ao primeiro tópico fá-lo subir ao topo.
    const replied = await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads/${thread.id}/posts`,
      headers,
      payload: { body: 'Tenta o ataque de mergulho.' },
    });
    expect(replied.statusCode).toBe(201);

    const list = await built.app.inject({
      method: 'GET',
      url: `/api/v1/threads?game=${encodeURIComponent(game)}`,
    });
    const items = list.json<{ items: { id: string; replyCount: number }[] }>().items;
    expect(items[0]?.id).toBe(thread.id);
    expect(items[0]?.replyCount).toBe(1);
  });

  it('um tópico fechado só aceita resposta do autor', async () => {
    const built = await buildTestApp();
    const author = await registerUser(built.app, `forum-${Date.now()}-author@nexora.local`);
    const stranger = await registerUser(built.app, `forum-${Date.now()}-stranger@nexora.local`);
    const headers = { ...authHeader(author.accessToken) };

    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/threads?game=g1',
      headers,
      payload: { title: 'Resolvido', body: 'Já consegui.' },
    });
    const thread = created.json<{ id: string }>();

    const locked = await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads/${thread.id}/lock`,
      headers,
      payload: { locked: true },
    });
    expect(locked.statusCode).toBe(200);

    const strangerReply = await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads/${thread.id}/posts`,
      headers: authHeader(stranger.accessToken),
      payload: { body: 'Eu sei a resposta!' },
    });
    expect(strangerReply.statusCode).toBe(403);

    const authorReply = await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads/${thread.id}/posts`,
      headers,
      payload: { body: 'Obrigado a todos.' },
    });
    expect(authorReply.statusCode).toBe(201);
  });

  it('fechar ou apagar o recurso de outro utilizador devolve 404', async () => {
    const built = await buildTestApp();
    const author = await registerUser(built.app, `forum-${Date.now()}-owner@nexora.local`);
    const stranger = await registerUser(built.app, `forum-${Date.now()}-other@nexora.local`);

    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/threads?game=g1',
      headers: authHeader(author.accessToken),
      payload: { title: 'Um tópico', body: 'A perguntar.' },
    });
    const thread = created.json<{ id: string }>();

    const stolenLock = await built.app.inject({
      method: 'POST',
      url: `/api/v1/threads/${thread.id}/lock`,
      headers: authHeader(stranger.accessToken),
      payload: { locked: true },
    });
    expect(stolenLock.statusCode).toBe(404);

    const stolenDelete = await built.app.inject({
      method: 'DELETE',
      url: `/api/v1/threads/${thread.id}`,
      headers: authHeader(stranger.accessToken),
    });
    expect(stolenDelete.statusCode).toBe(404);
  });

  it('sem sessão não escreve', async () => {
    const built = await buildTestApp();
    const created = await built.app.inject({
      method: 'POST',
      url: '/api/v1/threads?game=g1',
      payload: { title: 'Sem sessão', body: 'Não devia entrar.' },
    });
    expect(created.statusCode).toBe(401);
  });

  it('um tópico com título vazio é recusado', async () => {
    const built = await buildTestApp();
    const author = await registerUser(built.app, `forum-${Date.now()}-empty@nexora.local`);
    const bad = await built.app.inject({
      method: 'POST',
      url: '/api/v1/threads?game=g1',
      headers: authHeader(author.accessToken),
      payload: { title: '', body: 'Sem título.' },
    });
    expect(bad.statusCode).toBe(400);
  });
});