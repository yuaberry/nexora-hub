import { describe, expect, it } from 'vitest';
import { buildTestApp, authHeader } from './helpers.js';
import { registerUser } from './fixtures.js';

/**
 * Amigos e presença — o contrato social.
 *
 * O que estes testes travam: o pedido de amizade é **unidireccional na
 * aceitação** (só quem recebeu aceita ou recusa), a amizade vive nos dois
 * sentidos (remover apaga os dois), e a presença é um coração com validade —
 * quem passou do TTL não aparece, e a presença de quem não é amigo não
 * existe nesta API.
 */

/** App e repositórios partilhados por todos os utilizadores do teste. */
interface World {
  readonly app: Awaited<ReturnType<typeof buildTestApp>>['app'];
  readonly repositories: Awaited<ReturnType<typeof buildTestApp>>['repositories'];
  readonly email: (label: string) => string;
}

async function world(): Promise<World> {
  const built = await buildTestApp();
  const stamp = Date.now();
  let counter = 0;
  return {
    ...built,
    email: (label: string) => `social-${stamp}-${counter++}-${label}@nexora.local`,
  };
}

/** Vista devolvida pelas rotas. */
interface FriendsView {
  friends: { userId: string; displayName: string | null }[];
  incoming: { id: string; from: string }[];
  outgoing: { id: string; to: string }[];
}

/** Lê amigos, pedidos recebidos e enviados. */
async function friendsList(w: World, token: string): Promise<FriendsView> {
  const response = await w.app.inject({ method: 'GET', url: '/api/v1/friends', headers: authHeader(token) });
  return response.json() as FriendsView;
}

/** Pede amizade por email. */
async function requestFriend(w: World, token: string, email: string): Promise<number> {
  const response = await w.app.inject({
    method: 'POST',
    url: '/api/v1/friends',
    payload: { email },
    headers: authHeader(token),
  });
  return response.statusCode;
}

/** Responde a um pedido. */
async function respond(
  w: World,
  token: string,
  requestId: string,
  action: 'accept' | 'decline' | 'cancel',
): Promise<number> {
  const response = await w.app.inject({
    method: 'POST',
    url: `/api/v1/friends/requests/${requestId}/${action}`,
    headers: authHeader(token),
  });
  return response.statusCode;
}

/** Bate o coração da presença. */
async function heartbeat(w: World, token: string, gameId: string | null): Promise<number> {
  const response = await w.app.inject({
    method: 'POST',
    url: '/api/v1/presence/heartbeat',
    payload: { gameId },
    headers: authHeader(token),
  });
  return response.statusCode;
}

/** Presença visível. */
async function presence(w: World, token: string): Promise<{
  self: { status: string; gameId: string | null };
  friends: { userId: string; gameId: string | null }[];
}> {
  const response = await w.app.inject({ method: 'GET', url: '/api/v1/friends/presence', headers: authHeader(token) });
  return response.json() as never;
}

describe('amigos', () => {
  it('exige sessão', async () => {
    const w = await world();
    expect((await w.app.inject({ method: 'GET', url: '/api/v1/friends' })).statusCode).toBe(401);
  });

  it('sem amigos nem pedidos devolve listas vazias', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('vazio'));
    const list = await friendsList(w, member.accessToken);
    expect(list.friends).toHaveLength(0);
    expect(list.incoming).toHaveLength(0);
    expect(list.outgoing).toHaveLength(0);
  });

  it('pedir amizade cria um pedido pendente do outro lado', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('ana'));
    const bruno = await registerUser(w.app, w.email('bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);

    const deBruno = await friendsList(w, bruno.accessToken);
    expect(deBruno.incoming).toHaveLength(1);
    expect(deBruno.incoming[0]?.from).toBe(ana.userId);
    const deAna = await friendsList(w, ana.accessToken);
    expect(deAna.outgoing).toHaveLength(1);
    expect(deAna.outgoing[0]?.to).toBe(bruno.userId);
  });

  it('email sem conta recusa com 404 (o pedido não cria conta)', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('solo'));
    expect(await requestFriend(w, member.accessToken, w.email('fantasma'))).toBe(404);
  });

  it('ninguém é amigo de si mesmo', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('ego'));
    const response = await w.app.inject({
      method: 'POST',
      url: '/api/v1/friends',
      payload: { email: member.email },
      headers: authHeader(member.accessToken),
    });
    expect(response.statusCode).toBe(400);
  });

  it('dois pedidos pendentes para a mesma pessoa são recusados', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('dup-ana'));
    const bruno = await registerUser(w.app, w.email('dup-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    // Bruno devolve o pedido: já existe um pendente entre os dois.
    expect(await requestFriend(w, bruno.accessToken, ana.email)).toBe(409);
  });

  it('aceitar cria a amizade nos dois sentidos', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('aceite-ana'));
    const bruno = await registerUser(w.app, w.email('aceite-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    expect(await respond(w, bruno.accessToken, pedido.id, 'accept')).toBe(200);

    const deBruno = await friendsList(w, bruno.accessToken);
    expect(deBruno.friends.map((f) => f.userId)).toEqual([ana.userId]);
    const deAna = await friendsList(w, ana.accessToken);
    expect(deAna.friends.map((f) => f.userId)).toEqual([bruno.userId]);
  });

  it('só quem recebeu aceita', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('nao-ana'));
    const bruno = await registerUser(w.app, w.email('nao-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    // Ana tenta aceitar o pedido que ela própria enviou.
    expect(await respond(w, ana.accessToken, pedido.id, 'accept')).toBe(403);
    // Um estranho não pode — e a resposta não confirma que o pedido existe
    // (recurso de outro utilizador devolve 404, nunca 403).
    const terceiro = await registerUser(w.app, w.email('nao-terceiro'));
    expect(await respond(w, terceiro.accessToken, pedido.id, 'accept')).toBe(404);
  });

  it('recusar não cria amizade', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('recusa-ana'));
    const bruno = await registerUser(w.app, w.email('recusa-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    expect(await respond(w, bruno.accessToken, pedido.id, 'decline')).toBe(200);
    expect((await friendsList(w, bruno.accessToken)).friends).toHaveLength(0);
  });

  it('quem enviou cancela; quem recebeu não', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('canc-ana'));
    const bruno = await registerUser(w.app, w.email('canc-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    // Bruno tenta cancelar o pedido que não é dele.
    expect(await respond(w, bruno.accessToken, pedido.id, 'cancel')).toBe(403);
    // Ana cancela o que enviou.
    expect(await respond(w, ana.accessToken, pedido.id, 'cancel')).toBe(200);
    expect((await friendsList(w, bruno.accessToken)).incoming).toHaveLength(0);
  });

  it('remover apaga a amizade nos dois sentidos', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('rm-ana'));
    const bruno = await registerUser(w.app, w.email('rm-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    expect(await respond(w, bruno.accessToken, pedido.id, 'accept')).toBe(200);

    const response = await w.app.inject({
      method: 'DELETE',
      url: `/api/v1/friends/${ana.userId}`,
      headers: authHeader(bruno.accessToken),
    });
    expect(response.statusCode).toBe(204);
    expect((await friendsList(w, bruno.accessToken)).friends).toHaveLength(0);
    expect((await friendsList(w, ana.accessToken)).friends).toHaveLength(0);
  });

  it('remover quem não é amigo devolve 404', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('rm404-ana'));
    const bruno = await registerUser(w.app, w.email('rm404-bruno'));
    const response = await w.app.inject({
      method: 'DELETE',
      url: `/api/v1/friends/${ana.userId}`,
      headers: authHeader(bruno.accessToken),
    });
    expect(response.statusCode).toBe(404);
  });
});

describe('presença', () => {
  it('um heartbeat deixa o utilizador online', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('coracao'));
    expect(await heartbeat(w, member.accessToken, 'hollow-knight')).toBe(200);
    const vista = await presence(w, member.accessToken);
    expect(vista.self.status).toBe('online');
    expect(vista.self.gameId).toBe('hollow-knight');
  });

  it('o coração sem jogo diz online sem jogo', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('coracao-parado'));
    expect(await heartbeat(w, member.accessToken, null)).toBe(200);
    expect((await presence(w, member.accessToken)).self.gameId).toBeNull();
  });

  it('um amigo aparece a jogar; um estranho, não', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('pres-ana'));
    const bruno = await registerUser(w.app, w.email('pres-bruno'));
    const terceiro = await registerUser(w.app, w.email('pres-terceiro'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    expect(await respond(w, bruno.accessToken, pedido.id, 'accept')).toBe(200);

    expect(await heartbeat(w, ana.accessToken, 'hollow-knight')).toBe(200);
    expect(await heartbeat(w, terceiro.accessToken, 'repo')).toBe(200);

    const vista = await presence(w, bruno.accessToken);
    expect(vista.friends).toHaveLength(1);
    expect(vista.friends[0]?.userId).toBe(ana.userId);
    expect(vista.friends[0]?.gameId).toBe('hollow-knight');
    // A própria pessoa está fora da lista dos amigos.
    expect(vista.friends.some((f) => f.userId === bruno.userId)).toBe(false);
  });

  it('um amigo expirado não aparece', async () => {
    const w = await world();
    const ana = await registerUser(w.app, w.email('ttl-ana'));
    const bruno = await registerUser(w.app, w.email('ttl-bruno'));
    expect(await requestFriend(w, ana.accessToken, bruno.email)).toBe(201);
    const pedido = (await friendsList(w, bruno.accessToken)).incoming[0]!;
    expect(await respond(w, bruno.accessToken, pedido.id, 'accept')).toBe(200);

    // Coração semeado já vencido (a validade é de 45 s).
    const passado = new Date(Date.now() - 5 * 60 * 1000);
    await w.repositories.presence.heartbeat({
      userId: ana.userId,
      gameId: 'repo',
      at: passado,
      expiresAt: passado,
    });
    const vista = await presence(w, bruno.accessToken);
    expect(vista.friends).toHaveLength(0);
  });

  it('limpar os expirados devolve quantos tirou', async () => {
    const w = await world();
    const member = await registerUser(w.app, w.email('limpeza'));
    const passado = new Date(Date.now() - 5 * 60 * 1000);
    // Um coração de outra pessoa, já vencido, semeado directamente.
    await w.repositories.presence.heartbeat({ userId: '00000000-0000-0000-0000-000000000000', gameId: null, at: passado, expiresAt: passado });
    const response = await w.app.inject({
      method: 'POST',
      url: '/api/v1/presence/heartbeat',
      payload: { gameId: null },
      headers: authHeader(member.accessToken),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { pruned: number };
    // O coração vencido foi limpo a escrever — sem relógio escondido.
    expect(body.pruned).toBe(1);
  });
});