/**
 * Rating do ProtonDB — consulta **externa**, dita como externa.
 *
 * O rating é da ProtonDB (https://www.protondb.com), não nosso: a interface
 * mostra o valor, a data da consulta e a ligação. Sem app id da Steam não há
 * rating — e sem rede, a consulta falha com motivo, em vez de mostrar um
 * número inventado.
 *
 * O `fetch` é injectado (parâmetro, não global): é o que permite testar a
 * decisão sem rede — e testar a recusa sem esperar por um *timeout*.
 */

/** Níveis do ProtonDB (a ordem é a deles, não a nossa). */
export const PROTON_TIERS = ['platinum', 'gold', 'silver', 'bronze', 'borked'] as const;
export type ProtonTier = (typeof PROTON_TIERS)[number];

/** Um rating consultado. */
export interface ProtonRating {
  readonly tier: ProtonTier;
  /** Confiança declarada pela ProtonDB (`good`, `mixed`, `bad`). */
  readonly confidence: string;
  /** Pontuação média declarada (0–1). */
  readonly score: number;
  /** Número de relatórios. */
  readonly total: number;
  /** ISO-8601 UTC da consulta. */
  readonly fetchedAt: string;
  /** URL da fonte (mostrada na interface). */
  readonly sourceUrl: string;
}

/** Resultado da consulta. */
export type ProtonResult =
  | { readonly ok: true; readonly rating: ProtonRating }
  | { readonly ok: false; readonly reasonKey: 'no-app-id' | 'network' | 'not-found'; readonly reason: string };

/** Tempo limite da consulta (declarado — nada de espera infinita). */
export const PROTON_TIMEOUT_MS = 5_000;

/** URL pública do relatório de um jogo. */
export function protonReportUrl(appId: string): string {
  return `https://www.protondb.com/app/${appId}`;
}

/**
 * Consulta o rating de um jogo pelo app id da Steam.
 *
 * `fetchImpl` existe para os testes; em produção é o `fetch` do Node. A
 * consulta aborta ao fim do tempo limite — um launcher não pode ficar preso
 * a um site externo.
 */
export async function fetchProtonRating(
  appId: string | null,
  options: {
    readonly fetchImpl?: typeof fetch;
    readonly now?: () => Date;
    readonly timeoutMs?: number;
  } = {},
): Promise<ProtonResult> {
  if (appId === null || !/^\d{1,10}$/.test(appId)) {
    return { ok: false, reasonKey: 'no-app-id', reason: 'Este jogo não declara um app id da Steam.' };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? PROTON_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`https://www.protondb.com/api/v1/reports/simple/${appId}.json`, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 404) {
      return { ok: false, reasonKey: 'not-found', reason: 'A ProtonDB não tem relatórios para este jogo.' };
    }
    if (!response.ok) {
      return { ok: false, reasonKey: 'network', reason: `A ProtonDB devolveu ${response.status}.` };
    }
    const body = (await response.json()) as { tier?: unknown; confidence?: unknown; score?: unknown; total?: unknown };
    const tier = body.tier;
    if (typeof tier !== 'string' || !(PROTON_TIERS as readonly string[]).includes(tier)) {
      return { ok: false, reasonKey: 'network', reason: 'Resposta da ProtonDB sem nível reconhecido.' };
    }
    return {
      ok: true,
      rating: {
        tier: tier as ProtonTier,
        confidence: typeof body.confidence === 'string' ? body.confidence : 'unknown',
        score: typeof body.score === 'number' ? body.score : 0,
        total: typeof body.total === 'number' ? body.total : 0,
        fetchedAt: (options.now ?? (() => new Date()))().toISOString(),
        sourceUrl: protonReportUrl(appId),
      },
    };
  } catch {
    // *Timeout* ou rede em baixo: a consulta falha com motivo honesto.
    return { ok: false, reasonKey: 'network', reason: 'Não foi possível consultar a ProtonDB.' };
  } finally {
    clearTimeout(timeout);
  }
}