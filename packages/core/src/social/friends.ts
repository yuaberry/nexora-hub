/**
 * Amizades — máquina de estados pura.
 *
 * Um pedido de amizade é um convite **bidireccional na intenção e
 * unidireccional na aceitação**: quem pede espera, quem recebe decide. As
 * regras que estas funções travam:
 *
 * - ninguém é amigo de si mesmo;
 * - dois amigos não têm dois pedidos pendentes — um chega (o segundo é
 *   recusado, mesmo que venha do outro lado);
 * - só quem **recebeu** o pedido o aceita ou recusa;
 * - quem pediu pode cancelar (arrepender-se antes da resposta é normal);
 * - remover um amigo não precisa de pedido — é imediato.
 */

/** Estado de um pedido. */
export type FriendRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

/** Um pedido de amizade. */
export interface FriendRequest {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly status: FriendRequestStatus;
  /** ISO-8601 UTC do pedido. */
  readonly createdAt: string;
  /** ISO-8601 UTC da resposta, ou `null` enquanto está pendente. */
  readonly respondedAt: string | null;
}

/** Uma amizade estabelecida. */
export interface FriendLink {
  readonly userId: string;
  /** ISO-8601 UTC de quando a amizade nasceu. */
  readonly since: string;
}

/** O estado que as transições manipulam. */
export interface FriendsState {
  readonly requests: readonly FriendRequest[];
  readonly friends: readonly FriendLink[];
}

/** Estado inicial: sem pedidos e sem amigos. */
export const EMPTY_FRIENDS: FriendsState = { requests: [], friends: [] };

/** Motivos de recusa. */
export type FriendRefusal =
  | 'self-friend'
  | 'already-friends'
  | 'request-pending'
  | 'request-not-found'
  | 'not-recipient';

/** Resultado de uma transição. */
export type FriendOutcome =
  | { readonly ok: true; readonly state: FriendsState }
  | { readonly ok: false; readonly reason: FriendRefusal };

/** Pedidos pendentes **recebidos** por um utilizador. */
export function incomingRequests(state: FriendsState, userId: string): readonly FriendRequest[] {
  return state.requests.filter((request) => request.toId === userId && request.status === 'pending');
}

/** Pedidos pendentes **enviados** por um utilizador. */
export function outgoingRequests(state: FriendsState, userId: string): readonly FriendRequest[] {
  return state.requests.filter((request) => request.fromId === userId && request.status === 'pending');
}

/** Amigos de um utilizador, do mais recente ao mais antigo. */
export function friendIds(state: FriendsState): readonly string[] {
  return state.friends.map((friend) => friend.userId);
}

/** `true` quando os dois já são amigos. */
export function areFriends(state: FriendsState, userId: string): boolean {
  return state.friends.some((friend) => friend.userId === userId);
}

/**
 * Pede amizade a alguém.
 *
 * Recusa o pedido quando já existe um pendente entre os dois — em qualquer
 * direcção: dois pendentes para a mesma pessoa seriam dois "sim" para a
 * mesma amizade.
 *
 * O estado é a vista de **um** utilizador, e a amizade vive nos dois
 * estados: por isso os dois lados do par são consultados. Sem o segundo
 * lado, o teste apanhava o buraco — visto de um dos estados, quem já era
 * amigo parecia um desconhecido.
 */
export function requestFriend(
  state: FriendsState,
  input: { requestId: string; fromId: string; toId: string; now: string },
): FriendOutcome {
  if (input.fromId === input.toId) {
    return { ok: false, reason: 'self-friend' };
  }
  if (areFriends(state, input.toId) || areFriends(state, input.fromId)) {
    return { ok: false, reason: 'already-friends' };
  }
  const pending = state.requests.find(
    (request) =>
      request.status === 'pending' &&
      ((request.fromId === input.fromId && request.toId === input.toId) ||
        (request.fromId === input.toId && request.toId === input.fromId)),
  );
  if (pending !== undefined) {
    return { ok: false, reason: 'request-pending' };
  }
  const request: FriendRequest = {
    id: input.requestId,
    fromId: input.fromId,
    toId: input.toId,
    status: 'pending',
    createdAt: input.now,
    respondedAt: null,
  };
  return { ok: true, state: { ...state, requests: [...state.requests, request] } };
}

/** Aceita um pedido recebido — a amizade nasce nos dois sentidos. */
export function acceptFriendRequest(
  state: FriendsState,
  input: { actorId: string; requestId: string; now: string },
): FriendOutcome {
  const request = state.requests.find((item) => item.id === input.requestId);
  if (request === undefined || request.status !== 'pending') {
    return { ok: false, reason: 'request-not-found' };
  }
  // Só quem recebeu aceita: o id de quem aceita tem de ser o destinatário.
  if (request.toId !== input.actorId) {
    return { ok: false, reason: 'not-recipient' };
  }
  const requests = state.requests.map((item) =>
    item.id === request.id ? { ...item, status: 'accepted' as const, respondedAt: input.now } : item,
  );
  return {
    ok: true,
    state: {
      requests,
      friends: [...state.friends, { userId: request.fromId, since: input.now }],
    },
  };
}

/** Recusa um pedido recebido (quem recusou fica sem histórico de amizade). */
export function declineFriendRequest(
  state: FriendsState,
  input: { actorId: string; requestId: string; now: string },
): FriendOutcome {
  const request = state.requests.find((item) => item.id === input.requestId);
  if (request === undefined || request.status !== 'pending') {
    return { ok: false, reason: 'request-not-found' };
  }
  if (request.toId !== input.actorId) {
    return { ok: false, reason: 'not-recipient' };
  }
  const requests = state.requests.map((item) =>
    item.id === request.id ? { ...item, status: 'declined' as const, respondedAt: input.now } : item,
  );
  return { ok: true, state: { ...state, requests } };
}

/** Cancela um pedido enviado (quem pediu pode voltar atrás). */
export function cancelFriendRequest(
  state: FriendsState,
  input: { actorId: string; requestId: string; now: string },
): FriendOutcome {
  const request = state.requests.find((item) => item.id === input.requestId);
  if (request === undefined || request.status !== 'pending') {
    return { ok: false, reason: 'request-not-found' };
  }
  // Só quem enviou cancela — o destinatário não pode apagar o pedido alheio.
  if (request.fromId !== input.actorId) {
    return { ok: false, reason: 'not-recipient' };
  }
  const requests = state.requests.map((item) =>
    item.id === request.id ? { ...item, status: 'cancelled' as const, respondedAt: input.now } : item,
  );
  return { ok: true, state: { ...state, requests } };
}

/** Remove um amigo (imediato, sem pedido nem confirmação do outro lado). */
export function removeFriend(
  state: FriendsState,
  input: { actorId: string; userId: string },
): FriendOutcome {
  if (!areFriends(state, input.userId)) {
    return { ok: false, reason: 'request-not-found' };
  }
  return {
    ok: true,
    state: { ...state, friends: state.friends.filter((friend) => friend.userId !== input.userId) },
  };
}