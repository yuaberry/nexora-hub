import { describe, expect, it } from 'vitest';
import {
  bumped,
  canReply,
  MAX_POST_BODY_LENGTH,
  MAX_THREAD_TITLE_LENGTH,
  orderThreadsByActivity,
  type ForumThread,
} from '../../src/community/forums.js';

/**
 * Fóruns — as três regras da conversa.
 *
 * O que estes testes travam: a ordem é pela última actividade (respondido
 * sobe, mudo não salta a frente), um tópico fechado só aceita resposta do
 * autor, e os limites são declarados.
 */

/** Um tópico de prova. */
function thread(overrides: Partial<ForumThread> = {}): ForumThread {
  return {
    id: 't1',
    gameId: 'g1',
    authorId: 'u1',
    title: 'Como derrotar o boss?',
    body: 'Estou preso no terceiro boss.',
    createdAt: '2026-11-20T10:00:00.000Z',
    lastActivityAt: '2026-11-20T10:00:00.000Z',
    replyCount: 0,
    locked: false,
    ...overrides,
  };
}

describe('orderThreadsByActivity', () => {
  it('um tópico respondido sobe ao topo', () => {
    const threads = [
      thread({ id: 'antigo', lastActivityAt: '2026-11-20T10:00:00.000Z' }),
      thread({ id: 'respondido', lastActivityAt: '2026-11-22T18:00:00.000Z' }),
    ];
    expect(orderThreadsByActivity(threads).map((item) => item.id)).toEqual(['respondido', 'antigo']);
  });

  it('a ordem é estável (dois tópicos com a mesma data não dançam)', () => {
    const threads = [
      thread({ id: 'b', lastActivityAt: '2026-11-22T18:00:00.000Z' }),
      thread({ id: 'a', lastActivityAt: '2026-11-22T18:00:00.000Z' }),
    ];
    const first = orderThreadsByActivity(threads).map((item) => item.id);
    const second = orderThreadsByActivity(threads).map((item) => item.id);
    expect(first).toEqual(second);
  });
});

describe('canReply', () => {
  it('num tópico aberto, qualquer utilizador responde', () => {
    expect(canReply(thread(), 'qualquer-um')).toBe(true);
  });

  it('num tópico fechado, só o autor responde', () => {
    const closed = thread({ locked: true });
    expect(canReply(closed, 'u1')).toBe(true);
    expect(canReply(closed, 'outro')).toBe(false);
  });
});

describe('bumped', () => {
  it('uma resposta sobe a actividade e a contagem', () => {
    const before = thread();
    const after = bumped(before, '2026-11-23T09:00:00.000Z');
    expect(after.lastActivityAt).toBe('2026-11-23T09:00:00.000Z');
    expect(after.replyCount).toBe(1);
    // O original não muda (a função é pura).
    expect(before.replyCount).toBe(0);
  });
});

describe('limites declarados', () => {
  it('título e corpo têm limites conhecidos', () => {
    expect(MAX_THREAD_TITLE_LENGTH).toBe(120);
    expect(MAX_POST_BODY_LENGTH).toBe(4_000);
  });
});
