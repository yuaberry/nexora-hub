import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Chat — conversas directas entre amigos.
 *
 * O que estes testes travam: só amigos conversam (um estranho é recusado),
 * um par de pessoas tem **uma** conversa (a segunda abertura reutiliza), quem
 * não é participante não lê nem escreve (404, não 403), e o corpo da mensagem
 * é validado (vazio e longo demais).
 */

/** App e repositórios partilhados por todos os utilizadores do teste. */
interface World {
  readonly app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  readonly email: (label: string) => string;
}

async function world(): Promise<World> {
  const built = await buildTestApp();
  const stamp = Date.now();
  let counter = 0;
  return {
    app: built.app,
    email: (label: string) => `chat-${stamp}-${counter++}-${label}@nexora.local`,
  };
}

/** Torna duas pessoas amigas (o chat exige amizade). */
async function makeFriends(
  w: World,
  a: { userId: string; accessToken: string; email: string },
  b: { userId: string; accessToken: string; email: string },
): Promise<void> {
  await w.app.inject({
    method: 'POST',
    url: '/api/v1/friends',
    payload: { email: b.email },
    headers: authHeader(a.accessToken),
  });
  const incoming = (await w.app.inject({ method: 'GET', url: '/api/v1/friends', headers: authHeader(b.accessToken) })).json() as {
    incoming: { id: string }[];
  };
  await w.app.inject({
    method: 'POST',
    url: `/api/v1/friends/requests/${incoming.incoming[0]!.id}/accept`,
    headers: authHeader(b.accessToken),
  });
}

/** Abre a conversa com alguém por email. */
async function open(w: World, token: string, email: string): Promise<Response> {
  return (await w.app.inject({
    method: 'POST',
    url: '/api/v1/chat/conversations',
    payload: { email },
    headers: authHeader(token),
  })) as never;
}

type Response = { statusCode: number; json: () => unknown };

describe('conversas', () => {
  it('exige sessão', async () => {
    const w = await world();
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/chat/conversations' })).statusCode).toBe(401);
  });

  it('sem conversas devolve lista vazia', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('vazio'));
    const body = (await w.app.inject({ method: 'GET', url: '/api/v1/chat/conversations', headers: authHeader(member.accessToken) })).json() as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });

  it('amigos abrem conversa e o par reutiliza a mesma', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('ana'));
    const bruno = await registerUser(w.app, w.email('bruno'));
    await makeFriends(w, ana, bruno);

    const primeira = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    expect(primeira.statusCode).toBe(201);
    const id = (primeira.json() as { id: string }).id;

    const segunda = (await open(w, bruno.accessToken, ana.email)) as unknown as Response;
    expect((segunda.json() as { id: string }).id).toBe(id);

    // Cada um vê a conversa na sua lista.
    const listaAna = (await w.app.inject({ method: 'GET', url: '/api/v1/chat/conversations', headers: authHeader(ana.accessToken) })).json() as { items: { id: string }[] };
    expect(listaAna.items).toHaveLength(1);
    expect(listaAna.items[0]?.id).toBe(id);
  });

  it('um estranho não abre conversa (só amigos conversam)', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('so-ana'));
    const bruno = await registerUser(w.app, w.email('so-bruno'));
    const resposta = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    expect(resposta.statusCode).toBe(403);
  });

  it('email sem conta devolve 404', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('fantasma'));
    const resposta = (await open(w, member.accessToken, w.email('nao-existe'))) as unknown as Response;
    expect(resposta.statusCode).toBe(404);
  });
});

describe('mensagens', () => {
  it('enviar grava a mensagem e o outro lado lê', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('msg-ana'));
    const bruno = await registerUser(w.app, w.email('msg-bruno'));
    await makeFriends(w, ana, bruno);
    const conversa = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    const id = (conversa.json() as { id: string }).id;

    const envio = await w.app.inject({
      method: 'POST',
      url: `/api/v1/chat/conversations/${id}/messages`,
      payload: { body: 'Bora jogar?' },
      headers: authHeader(ana.accessToken),
    });
    expect(envio.statusCode).toBe(201);

    const leitura = (await w.app.inject({
      method: 'GET',
      url: `/api/v1/chat/conversations/${id}/messages`,
      headers: authHeader(bruno.accessToken),
    })).json() as { items: { body: string; mine: boolean }[] };
    expect(leitura.items).toHaveLength(1);
    expect(leitura.items[0]?.body).toBe('Bora jogar?');
    // A marca "minha" é do leitor, não de quem escreveu.
    expect(leitura.items[0]?.mine).toBe(false);
  });

  it('quem não é participante não lê (404, não 403)', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('np-ana'));
    const bruno = await registerUser(w.app, w.email('np-bruno'));
    const terceiro = await registerUser(w.app, w.email('np-terceiro'));
    await makeFriends(w, ana, bruno);
    const conversa = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    const id = (conversa.json() as { id: string }).id;

    const resposta = await w.app.inject({
      method: 'GET',
      url: `/api/v1/chat/conversations/${id}/messages`,
      headers: authHeader(terceiro.accessToken),
    });
    expect(resposta.statusCode).toBe(404);
  });

  it('quem não é participante não escreve', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('nw-ana'));
    const bruno = await registerUser(w.app, w.email('nw-bruno'));
    const terceiro = await registerUser(w.app, w.email('nw-terceiro'));
    await makeFriends(w, ana, bruno);
    const conversa = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    const id = (conversa.json() as { id: string }).id;

    const resposta = await w.app.inject({
      method: 'POST',
      url: `/api/v1/chat/conversations/${id}/messages`,
      payload: { body: 'olá' },
      headers: authHeader(terceiro.accessToken),
    });
    expect(resposta.statusCode).toBe(404);
  });

  it('um corpo vazio ou longo demais é recusado com 400', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('corpo-ana'));
    const bruno = await registerUser(w.app, w.email('corpo-bruno'));
    await makeFriends(w, ana, bruno);
    const conversa = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    const id = (conversa.json() as { id: string }).id;

    const vazio = await w.app.inject({
      method: 'POST',
      url: `/api/v1/chat/conversations/${id}/messages`,
      payload: { body: '   ' },
      headers: authHeader(ana.accessToken),
    });
    expect(vazio.statusCode).toBe(400);

    const longo = await w.app.inject({
      method: 'POST',
      url: `/api/v1/chat/conversations/${id}/messages`,
      payload: { body: 'x'.repeat(2001) },
      headers: authHeader(ana.accessToken),
    });
    expect(longo.statusCode).toBe(400);
  });

  it('o excerto da conversa mostra a última mensagem', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('exc-ana'));
    const bruno = await registerUser(w.app, w.email('exc-bruno'));
    await makeFriends(w, ana, bruno);
    const conversa = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    const id = (conversa.json() as { id: string }).id;
    await w.app.inject({
      method: 'POST',
      url: `/api/v1/chat/conversations/${id}/messages`,
      payload: { body: 'Vamos ao REPO?' },
      headers: authHeader(bruno.accessToken),
    });
    const lista = (await w.app.inject({ method: 'GET', url: '/api/v1/chat/conversations', headers: authHeader(ana.accessToken) })).json() as {
      items: { lastMessageExcerpt: string | null }[];
    };
    expect(lista.items[0]?.lastMessageExcerpt).toBe('Vamos ao REPO?');
  });

  it('limite inválido devolve 400', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('lim-ana'));
    const bruno = await registerUser(w.app, w.email('lim-bruno'));
    await makeFriends(w, ana, bruno);
    const conversa = (await open(w, ana.accessToken, bruno.email)) as unknown as Response;
    const id = (conversa.json() as { id: string }).id;
    const resposta = await w.app.inject({
      method: 'GET',
      url: `/api/v1/chat/conversations/${id}/messages?limit=999`,
      headers: authHeader(ana.accessToken),
    });
    expect(resposta.statusCode).toBe(400);
  });
});