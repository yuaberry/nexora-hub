/**
 * Conversas — máquina de estados pura.
 *
 * Um chat directo é entre **duas** pessoas: um par tem uma conversa só
 * (mandar segunda mensagem à mesma pessoa continua na mesma conversa, não
 * abre outra). Quem não é participante não lê nem escreve — e um recurso de
 * outro utilizador devolve `not-participant`, que a rota traduz em 404, para
 * não confirmar que a conversa existe.
 */

/** Uma conversa directa. */
export interface Conversation {
  readonly id: string;
  /** Os dois participantes (a ordem é a da criação). */
  readonly participants: readonly [string, string];
  /** ISO-8601 UTC da criação. */
  readonly createdAt: string;
  /** ISO-8601 UTC da última mensagem (para ordenar a lista). */
  readonly lastMessageAt: string | null;
  /** Excerto da última mensagem (para a lista não precisar de as ler). */
  readonly lastMessageExcerpt: string | null;
}

/** Uma mensagem. */
export interface ChatMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly authorId: string;
  readonly body: string;
  /** ISO-8601 UTC do envio. */
  readonly createdAt: string;
}

/** O estado que as transições manipulam. */
export interface ChatState {
  readonly conversations: readonly Conversation[];
  readonly messages: readonly ChatMessage[];
}

/** Estado inicial: sem conversas nem mensagens. */
export const EMPTY_CHAT: ChatState = { conversations: [], messages: [] };

/** Limites declarados. */
export const MAX_MESSAGE_LENGTH = 2_000;
export const MAX_EXCERPT_LENGTH = 120;

/** Motivos de recusa. */
export type ChatRefusal =
  | 'self-chat'
  | 'already-open'
  | 'not-participant'
  | 'empty-body'
  | 'too-long'
  | 'conversation-not-found';

/** Resultado de uma transição. */
export type ChatOutcome =
  | { readonly ok: true; readonly state: ChatState }
  | { readonly ok: false; readonly reason: ChatRefusal };

/** A conversa directa entre duas pessoas, se existir. */
export function findDirectConversation(
  state: ChatState,
  a: string,
  b: string,
): Conversation | null {
  return (
    state.conversations.find(
      (conversation) =>
        conversation.participants.length === 2 &&
        ((conversation.participants[0] === a && conversation.participants[1] === b) ||
          (conversation.participants[0] === b && conversation.participants[1] === a)),
    ) ?? null
  );
}

/** Conversas de um utilizador, da mais recente para a mais antiga. */
export function conversationsOf(state: ChatState, userId: string): readonly Conversation[] {
  return state.conversations
    .filter((conversation) => conversation.participants.includes(userId))
    .sort((left, right) => (right.lastMessageAt ?? right.createdAt).localeCompare(left.lastMessageAt ?? left.createdAt));
}

/**
 * Abre (ou reutiliza) a conversa directa com alguém.
 *
 * Recusar falar consigo mesmo é o mínimo; reutilizar a conversa existente é
 * o que impede uma lista com dez conversas para a mesma pessoa.
 */
export function openDirectConversation(
  state: ChatState,
  input: { conversationId: string; actorId: string; withId: string; now: string },
): ChatOutcome & { readonly conversationId?: string } {
  if (input.actorId === input.withId) {
    return { ok: false, reason: 'self-chat' };
  }
  const existing = findDirectConversation(state, input.actorId, input.withId);
  if (existing !== null) {
    return { ok: true, state, conversationId: existing.id };
  }
  const conversation: Conversation = {
    id: input.conversationId,
    participants: [input.actorId, input.withId],
    createdAt: input.now,
    lastMessageAt: null,
    lastMessageExcerpt: null,
  };
  return {
    ok: true,
    state: { ...state, conversations: [...state.conversations, conversation] },
    conversationId: conversation.id,
  };
}

/**
 * Envia uma mensagem numa conversa.
 *
 * O corpo é aparado antes de medir: espaços em branco não são mensagem, e
 * um corpo só com espaços não pode contar como "vazio" ou como "longa".
 */
export function sendMessage(
  state: ChatState,
  input: { messageId: string; conversationId: string; authorId: string; body: string; now: string },
): ChatOutcome & { readonly message?: ChatMessage } {
  const conversation = state.conversations.find((item) => item.id === input.conversationId);
  if (conversation === undefined) {
    return { ok: false, reason: 'conversation-not-found' };
  }
  if (!conversation.participants.includes(input.authorId)) {
    return { ok: false, reason: 'not-participant' };
  }
  const body = input.body.trim();
  if (body === '') {
    return { ok: false, reason: 'empty-body' };
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, reason: 'too-long' };
  }
  const message: ChatMessage = {
    id: input.messageId,
    conversationId: conversation.id,
    authorId: input.authorId,
    body,
    createdAt: input.now,
  };
  const conversations = state.conversations.map((item) =>
    item.id === conversation.id
      ? {
          ...item,
          lastMessageAt: input.now,
          lastMessageExcerpt: body.slice(0, MAX_EXCERPT_LENGTH),
        }
      : item,
  );
  return {
    ok: true,
    state: { ...state, conversations, messages: [...state.messages, message] },
    message,
  };
}

/** Mensagens de uma conversa, da mais antiga para a mais recente. */
export function messagesOf(state: ChatState, conversationId: string): readonly ChatMessage[] {
  return state.messages
    .filter((message) => message.conversationId === conversationId)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

/** O outro participante de uma conversa directa. */
export function otherParticipant(conversation: Conversation, userId: string): string | null {
  return conversation.participants.find((participant) => participant !== userId) ?? null;
}