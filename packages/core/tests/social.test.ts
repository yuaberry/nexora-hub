import { describe, expect, it } from 'vitest';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  EMPTY_FRIENDS,
  friendIds,
  incomingRequests,
  outgoingRequests,
  removeFriend,
  requestFriend,
  type FriendsState,
} from '../src/social/friends.js';
import {
  applyHeartbeat,
  PRESENCE_TTL_SECONDS,
  presenceGameId,
  presenceStatus,
  pruneExpired,
  visiblePresence,
} from '../src/social/presence.js';

/** Pede amizade de `a` para `b` e devolve o estado novo. */
function pedir(from: string, to: string, now = '2026-01-01T10:00:00.000Z'): { state: FriendsState; requestId: string } {
  const requestId = `req-${from}-${to}`;
  const outcome = requestFriend(EMPTY_FRIENDS, { requestId, fromId: from, toId: to, now });
  if (!outcome.ok) {
    throw new Error(`pedido deveria ser aceite: ${outcome.reason}`);
  }
  return { state: outcome.state, requestId };
}

describe('pedidos de amizade', () => {
  it('pedir cria um pedido pendente do remetente para o destinatário', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    expect(incomingRequests(state, 'bruno')).toHaveLength(1);
    expect(outgoingRequests(state, 'ana')).toHaveLength(1);
    expect(state.requests[0]?.id).toBe(requestId);
  });

  it('ninguém é amigo de si mesmo', () => {
    const outcome = requestFriend(EMPTY_FRIENDS, { requestId: 'r1', fromId: 'ana', toId: 'ana', now: '2026-01-01T10:00:00.000Z' });
    expect(outcome).toEqual({ ok: false, reason: 'self-friend' });
  });

  it('dois pedidos pendentes para a mesma pessoa são recusados', () => {
    const { state } = pedir('ana', 'bruno');
    const segundo = requestFriend(state, { requestId: 'r2', fromId: 'bruno', toId: 'ana', now: '2026-01-01T11:00:00.000Z' });
    expect(segundo).toEqual({ ok: false, reason: 'request-pending' });
  });

  it('aceitar cria a amizade nos dois sentidos', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    const outcome = acceptFriendRequest(state, { actorId: 'bruno', requestId, now: '2026-01-01T12:00:00.000Z' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(friendIds(outcome.state)).toEqual(['ana']);
    expect(outcome.state.requests[0]?.status).toBe('accepted');
  });

  it('só quem recebeu aceita', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    const outcome = acceptFriendRequest(state, { actorId: 'ana', requestId, now: '2026-01-01T12:00:00.000Z' });
    expect(outcome).toEqual({ ok: false, reason: 'not-recipient' });
  });

  it('recusar não cria amizade', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    const outcome = declineFriendRequest(state, { actorId: 'bruno', requestId, now: '2026-01-01T12:00:00.000Z' });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.state.friends).toHaveLength(0);
    // Com o pedido respondido, um novo pedido passa a ser possível.
    expect(requestFriend(outcome.state, { requestId: 'r9', fromId: 'ana', toId: 'bruno', now: '2026-01-01T13:00:00.000Z' }).ok).toBe(true);
  });

  it('quem pediu pode cancelar; o destinatário não', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    expect(cancelFriendRequest(state, { actorId: 'bruno', requestId, now: '2026-01-01T12:00:00.000Z' })).toEqual({ ok: false, reason: 'not-recipient' });
    const outcome = cancelFriendRequest(state, { actorId: 'ana', requestId, now: '2026-01-01T12:00:00.000Z' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(incomingRequests(outcome.state, 'bruno')).toHaveLength(0);
    }
  });

  it('pedir a quem já é amigo é recusado, visto dos dois estados', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    const aceite = acceptFriendRequest(state, { actorId: 'bruno', requestId, now: '2026-01-01T12:00:00.000Z' });
    expect(aceite.ok).toBe(true);
    if (!aceite.ok) {
      return;
    }
    // Do estado de quem aceitou (tem 'ana' na lista): recusado.
    expect(requestFriend(aceite.state, { requestId: 'r3', fromId: 'ana', toId: 'bruno', now: '2026-01-01T13:00:00.000Z' })).toEqual({ ok: false, reason: 'already-friends' });
    // Do estado de quem pediu (tem 'bruno' na lista): também recusado — o
    // buraco que o teste apanhou era sondar só um dos lados do par.
    const deQuemPediu: FriendsState = { requests: aceite.state.requests, friends: [{ userId: 'bruno', since: '2026-01-01T12:00:00.000Z' }] };
    expect(requestFriend(deQuemPediu, { requestId: 'r4', fromId: 'ana', toId: 'bruno', now: '2026-01-01T13:00:00.000Z' })).toEqual({ ok: false, reason: 'already-friends' });
  });

  it('remover um amigo é imediato', () => {
    const { state, requestId } = pedir('ana', 'bruno');
    const aceite = acceptFriendRequest(state, { actorId: 'bruno', requestId, now: '2026-01-01T12:00:00.000Z' });
    expect(aceite.ok).toBe(true);
    if (!aceite.ok) {
      return;
    }
    // O estado é o de quem aceitou: a lista dele tem 'ana'.
    const outcome = removeFriend(aceite.state, { actorId: 'bruno', userId: 'ana' });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(friendIds(outcome.state)).toEqual([]);
    }
  });

  it('aceitar um pedido inexistente não faz nada', () => {
    expect(acceptFriendRequest(EMPTY_FRIENDS, { actorId: 'ana', requestId: 'nao-existe', now: '2026-01-01T12:00:00.000Z' })).toEqual({ ok: false, reason: 'request-not-found' });
  });
});

describe('presença', () => {
  const now = '2026-01-01T12:00:00.000Z';

  it('um heartbeat deixa o utilizador online', () => {
    const state = applyHeartbeat([], { userId: 'ana', now });
    expect(presenceStatus(state[0]!, now)).toBe('online');
    expect(state[0]?.expiresAt).toBe(`2026-01-01T12:00:${String(PRESENCE_TTL_SECONDS).padStart(2, '0')}.000Z`);
  });

  it('o jogo em curso viaja no heartbeat', () => {
    const state = applyHeartbeat([], { userId: 'ana', now, activity: { gameId: 'hollow-knight' } });
    expect(presenceGameId(state[0]!, now)).toBe('hollow-knight');
  });

  it('passada a validade, o utilizador fica offline', () => {
    const state = applyHeartbeat([], { userId: 'ana', now, activity: { gameId: 'hollow-knight' } });
    const depois = '2026-01-01T12:10:00.000Z';
    expect(presenceStatus(state[0]!, depois)).toBe('offline');
    // E o jogo é esquecido: "esteve a jogar" não é "está a jogar".
    expect(presenceGameId(state[0]!, depois)).toBeNull();
  });

  it('um coração substitui o anterior (um registo por utilizador)', () => {
    const primeiro = applyHeartbeat([], { userId: 'ana', now });
    const segundo = applyHeartbeat(primeiro, { userId: 'ana', now: '2026-01-01T12:00:20.000Z' });
    expect(segundo).toHaveLength(1);
    expect(segundo[0]?.at).toBe('2026-01-01T12:00:20.000Z');
  });

  it('só os amigos aparecem na presença visível', () => {
    let state = applyHeartbeat([], { userId: 'ana', now, activity: { gameId: 'hollow-knight' } });
    state = applyHeartbeat(state, { userId: 'carla', now, activity: { gameId: 'terraria' } });
    state = applyHeartbeat(state, { userId: 'digno', now, activity: { gameId: 'repo' } });
    const visivel = visiblePresence(state, { friendIds: ['ana', 'carla'], now });
    expect(visivel.map((entry) => entry.userId).sort()).toEqual(['ana', 'carla']);
  });

  it('a própria pessoa está fora da lista', () => {
    const state = applyHeartbeat([], { userId: 'ana', now });
    const visivel = visiblePresence(state, { friendIds: ['ana'], now, excludeUserId: 'ana' });
    expect(visivel).toHaveLength(0);
  });

  it('um amigo expirado não aparece', () => {
    const state = applyHeartbeat([], { userId: 'ana', now });
    const depois = '2026-01-01T13:00:00.000Z';
    expect(visiblePresence(state, { friendIds: ['ana'], now: depois })).toHaveLength(0);
  });

  it('limpar os expirados mantém os vivos', () => {
    let state = applyHeartbeat([], { userId: 'ana', now });
    state = applyHeartbeat(state, { userId: 'bruno', now: '2026-01-01T11:00:00.000Z' });
    const limpo = pruneExpired(state, now);
    expect(limpo.map((entry) => entry.userId)).toEqual(['ana']);
  });
});