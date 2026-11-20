/**
 * Agregação de estatísticas de jogo.
 *
 * Funções puras sobre uma lista de sessões: o mesmo histórico dá sempre as
 * mesmas contas. Nada é pré-calculado nem inventado — um jogo sem sessão não
 * aparece no "top", e uma hora sem sessão não aparece no histograma.
 */

/** Uma sessão de jogo (o que a agregação consome). */
export interface SessionSample {
  /** Identificador do jogo. */
  readonly gameId: string;
  /** ISO-8601 UTC do início. */
  readonly startedAt: string;
  /** Duração em segundos. */
  readonly durationSeconds: number;
}

/** Etiquetas por jogo (género, modo…), para o género favorito. */
export type TagsByGame = ReadonlyMap<string, readonly string[]>;

/** Resumo das estatísticas de um período. */
export interface StatsSummary {
  /** Total de horas jogadas. */
  readonly totalHours: number;
  /** Número de sessões. */
  readonly sessionCount: number;
  /** Jogos distintos jogados. */
  readonly distinctGames: number;
  /** Top de jogos por tempo (id + horas). */
  readonly topGames: readonly { readonly gameId: string; readonly hours: number }[];
  /** Etiquetas mais frequentes (género favorito primeiro). */
  readonly topTags: readonly { readonly tag: string; readonly hours: number }[];
  /** Sessões por hora do dia (0–23), para "a que horas joga". */
  readonly hourHistogram: readonly number[];
  /** Hora com mais sessões (0–23), ou `null` sem sessões. */
  readonly peakHour: number | null;
}

/** Segundos por hora. */
const SECONDS_PER_HOUR = 3_600;

/** Converte segundos em horas (com duas casas). */
function toHours(seconds: number): number {
  return Math.round((seconds / SECONDS_PER_HOUR) * 100) / 100;
}

/** Soma segundos por jogo. */
function secondsByGame(sessions: readonly SessionSample[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    totals.set(session.gameId, (totals.get(session.gameId) ?? 0) + session.durationSeconds);
  }
  return totals;
}

/**
 * Agrega o resumo das estatísticas.
 *
 * `limit` limita o top de jogos e de etiquetas — a interface pede o que
 * mostra, e a função não devolve o que não foi pedido.
 */
export function summarizeSessions(
  sessions: readonly SessionSample[],
  tagsByGame: TagsByGame = new Map(),
  limit = 5,
): StatsSummary {
  const totals = secondsByGame(sessions);
  const hourHistogram = new Array<number>(24).fill(0);
  for (const session of sessions) {
    const hour = new Date(session.startedAt).getUTCHours();
    if (hour >= 0 && hour < 24) {
      hourHistogram[hour] = (hourHistogram[hour] ?? 0) + 1;
    }
  }

  let peakHour: number | null = null;
  let peakCount = 0;
  for (let hour = 0; hour < 24; hour += 1) {
    const count = hourHistogram[hour] ?? 0;
    if (count > peakCount) {
      peakCount = count;
      peakHour = hour;
    }
  }

  const topGames = [...totals.entries()]
    .map(([gameId, seconds]) => ({ gameId, hours: toHours(seconds) }))
    .sort((left, right) => right.hours - left.hours || left.gameId.localeCompare(right.gameId))
    .slice(0, limit);

  // As etiquetas herdam o tempo do jogo: um jogo de 10 h com "sandbox" dá
  // 10 h a "sandbox" — a conta é declarada, não uma média inventada.
  const tagSeconds = new Map<string, number>();
  for (const [gameId, seconds] of totals) {
    const tags = tagsByGame.get(gameId) ?? [];
    for (const tag of tags) {
      tagSeconds.set(tag, (tagSeconds.get(tag) ?? 0) + seconds);
    }
  }

  const topTags = [...tagSeconds.entries()]
    .map(([tag, seconds]) => ({ tag, hours: toHours(seconds) }))
    .sort((left, right) => right.hours - left.hours || left.tag.localeCompare(right.tag))
    .slice(0, limit);

  const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);

  return {
    totalHours: toHours(totalSeconds),
    sessionCount: sessions.length,
    distinctGames: totals.size,
    topGames,
    topTags,
    hourHistogram,
    peakHour,
  };
}