/**
 * Fóruns — as regras da conversa, puras.
 *
 * Um fórum de jogo é uma lista de tópicos onde cada resposta faz o tópico
 * subir. Três regras vivem aqui, testadas sem rede nem base de dados:
 *
 * - a ordem é pela **última actividade** — um tópico respondido volta ao
 *   topo, e um tópico mudo nunca salta a frente por ser antigo;
 * - o autor pode **fechar** o seu tópico: fechado, só ele responde (é a
 *   resposta de quem perguntou, não um silêncio para os outros);
 * - os limites são declarados (título e corpo) — a validação é da rota, mas
 *   o número que a rota impõe nasce aqui.
 */

/** O maior título de um tópico. */
export const MAX_THREAD_TITLE_LENGTH = 120;

/** O maior corpo de um tópico ou resposta. */
export const MAX_POST_BODY_LENGTH = 4_000;

/** Um tópico (o que a lista mostra). */
export interface ForumThread {
  readonly id: string;
  readonly gameId: string;
  readonly authorId: string;
  readonly title: string;
  /** O corpo da primeira mensagem (a pergunta). */
  readonly body: string;
  readonly createdAt: string;
  /** ISO-8601 UTC da última resposta (ou da criação, sem respostas). */
  readonly lastActivityAt: string;
  /** Quantas respostas o tópico tem (sem contar a primeira mensagem). */
  readonly replyCount: number;
  /** Fechado pelo autor: só ele responde. */
  readonly locked: boolean;
}

/** Uma resposta dentro de um tópico. */
export interface ForumPost {
  readonly id: string;
  readonly threadId: string;
  readonly authorId: string;
  readonly body: string;
  readonly createdAt: string;
}

/**
 * Os tópicos de um jogo, do mais activo para o menos activo.
 *
 * A ordenação é estável: dois tópicos com a mesma data ficam na ordem em que
 * chegaram (a lista não dança entre pedidos iguais).
 */
export function orderThreadsByActivity(threads: readonly ForumThread[]): readonly ForumThread[] {
  return [...threads].sort((left, right) => {
    const byActivity = right.lastActivityAt.localeCompare(left.lastActivityAt);
    return byActivity !== 0 ? byActivity : left.id.localeCompare(right.id);
  });
}

/**
 * Quem pode responder num tópico.
 *
 * Um tópico aberto responde-se por qualquer utilizador com sessão. Fechado,
 * responde-se **só pelo autor** — fechar é a forma de quem perguntou dizer
 * "resolvido", não uma sala trancada para os outros.
 */
export function canReply(thread: ForumThread, userId: string): boolean {
  return thread.locked ? thread.authorId === userId : true;
}

/** O tópico depois de uma resposta: a actividade sobe e a contagem também. */
export function bumped(thread: ForumThread, at: string): ForumThread {
  return {
    ...thread,
    lastActivityAt: at,
    replyCount: thread.replyCount + 1,
  };
}