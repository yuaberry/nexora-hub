import { describe, expect, it } from 'vitest';
import {
  conversationsOf,
  EMPTY_CHAT,
  findDirectConversation,
  messagesOf,
  openDirectConversation,
  otherParticipant,
  sendMessage,
  type ChatState,
} from '../src/chat/conversations.js';

/** Abre uma conversa entre duas pessoas e devolve o estado novo. */
function abrir(a: string, b: string, id = 'c1'): ChatState {
  const outcome = openDirectConversation(EMPTY_CHAT, { conversationId: id, actorId: a, withId: b, now: '2026-01-01T10:00:00.000Z' });
  if (!outcome.ok) {
    throw new Error(`conversa deveria abrir: ${outcome.reason}`);
  }
  return outcome.state;
}

describe('abrir conversa', () => {
  it('abre uma conversa entre duas pessoas', () => {
    const estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'ana', 'bruno');
    expect(conversa?.participants).toEqual(['ana', 'bruno']);
    expect(conversationsOf(estado, 'ana')).toHaveLength(1);
    expect(conversationsOf(estado, 'terceiro')).toHaveLength(0);
  });

  it('ninguém fala consigo mesmo', () => {
    const outcome = openDirectConversation(EMPTY_CHAT, {
      conversationId: 'c1',
      actorId: 'ana',
      withId: 'ana',
      now: '2026-01-01T10:00:00.000Z',
    });
    expect(outcome).toEqual({ ok: false, reason: 'self-chat' });
  });

  it('o mesmo par reutiliza a conversa (não abre uma segunda)', () => {
    const estado = abrir('ana', 'bruno');
    const outcome = openDirectConversation(estado, {
      conversationId: 'c2',
      actorId: 'bruno',
      withId: 'ana',
      now: '2026-01-01T11:00:00.000Z',
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.conversationId).toBe('c1');
      expect(outcome.state.conversations).toHaveLength(1);
    }
  });

  it('o outro participante é quem se espera', () => {
    const estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'bruno', 'ana')!;
    expect(otherParticipant(conversa, 'ana')).toBe('bruno');
    expect(otherParticipant(conversa, 'bruno')).toBe('ana');
  });
});

describe('mensagens', () => {
  it('enviar grava a mensagem e actualiza a conversa', () => {
    const estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'ana', 'bruno')!;
    const outcome = sendMessage(estado, {
      messageId: 'm1',
      conversationId: conversa.id,
      authorId: 'ana',
      body: '  Olá!  ',
      now: '2026-01-01T11:00:00.000Z',
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    // O corpo é aparado: espaços em branco não são mensagem.
    expect(outcome.message?.body).toBe('Olá!');
    const actualizada = findDirectConversation(outcome.state, 'ana', 'bruno')!;
    expect(actualizada.lastMessageAt).toBe('2026-01-01T11:00:00.000Z');
    expect(actualizada.lastMessageExcerpt).toBe('Olá!');
  });

  it('quem não é participante não escreve', () => {
    const estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'ana', 'bruno')!;
    const outcome = sendMessage(estado, {
      messageId: 'm1',
      conversationId: conversa.id,
      authorId: 'terceiro',
      body: 'olá',
      now: '2026-01-01T11:00:00.000Z',
    });
    expect(outcome).toEqual({ ok: false, reason: 'not-participant' });
  });

  it('um corpo vazio ou só com espaços não é mensagem', () => {
    const estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'ana', 'bruno')!;
    expect(sendMessage(estado, { messageId: 'm1', conversationId: conversa.id, authorId: 'ana', body: '   ', now: '2026-01-01T11:00:00.000Z' })).toEqual({ ok: false, reason: 'empty-body' });
  });

  it('uma mensagem longa demais é recusada', () => {
    const estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'ana', 'bruno')!;
    const outcome = sendMessage(estado, {
      messageId: 'm1',
      conversationId: conversa.id,
      authorId: 'ana',
      body: 'x'.repeat(2001),
      now: '2026-01-01T11:00:00.000Z',
    });
    expect(outcome).toEqual({ ok: false, reason: 'too-long' });
  });

  it('uma conversa inexistente não aceita mensagens', () => {
    const outcome = sendMessage(EMPTY_CHAT, {
      messageId: 'm1',
      conversationId: 'nao-existe',
      authorId: 'ana',
      body: 'olá',
      now: '2026-01-01T11:00:00.000Z',
    });
    expect(outcome).toEqual({ ok: false, reason: 'conversation-not-found' });
  });

  it('as mensagens vêm da mais antiga para a mais recente', () => {
    let estado = abrir('ana', 'bruno');
    const conversa = findDirectConversation(estado, 'ana', 'bruno')!;
    estado = (sendMessage(estado, { messageId: 'm1', conversationId: conversa.id, authorId: 'ana', body: 'primeira', now: '2026-01-01T11:00:00.000Z' }) as { ok: true; state: ChatState }).state;
    estado = (sendMessage(estado, { messageId: 'm2', conversationId: conversa.id, authorId: 'bruno', body: 'segunda', now: '2026-01-01T11:05:00.000Z' }) as { ok: true; state: ChatState }).state;
    const mensagens = messagesOf(estado, conversa.id);
    expect(mensagens.map((m) => m.body)).toEqual(['primeira', 'segunda']);
  });

  it('a lista de conversas ordena-se pela última mensagem', () => {
    let estado = abrir('ana', 'bruno', 'c1');
    const segunda = openDirectConversation(estado, {
      conversationId: 'c2',
      actorId: 'ana',
      withId: 'carla',
      now: '2026-01-01T09:00:00.000Z',
    });
    expect(segunda.ok).toBe(true);
    if (!segunda.ok) {
      return;
    }
    estado = segunda.state;
    const c1 = findDirectConversation(estado, 'ana', 'bruno')!;
    estado = (sendMessage(estado, { messageId: 'm1', conversationId: c1.id, authorId: 'ana', body: 'olá', now: '2026-01-01T11:00:00.000Z' }) as { ok: true; state: ChatState }).state;
    const conversas = conversationsOf(estado, 'ana');
    expect(conversas[0]?.id).toBe('c1');
  });
});