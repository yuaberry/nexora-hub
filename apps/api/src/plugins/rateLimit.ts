import type { FastifyInstance, FastifyRequest } from 'fastify';
import { errors } from './errorHandler.js';

/**
 * Limite de taxa em memória, por IP + rota.
 *
 * Espelha o Nexora Cloud: limite **por processo** e balcão **dentro** da
 * aplicação (duas aplicações no mesmo processo não partilham contadores). Um
 * limite distribuído exige Redis — planeado, não implementado.
 */

/** Regra de limite: máximo de pedidos por janela. */
export interface RateLimitRule {
  readonly max: number;
  readonly windowMs: number;
}

export interface RateLimitOptions extends RateLimitRule {
  readonly enabled: boolean;
  /** Substituições por rota (a chave é o padrão da rota). */
  readonly overrides?: Record<string, RateLimitRule>;
}

interface Bucket {
  hits: number[];
}

/** Registra o limite de taxa. */
export function registerRateLimit(app: FastifyInstance, options: RateLimitOptions): void {
  if (!options.enabled) {
    return;
  }

  const buckets = new Map<string, Bucket>();

  app.addHook('onRequest', async (request: FastifyRequest) => {
    const route = routeKey(request);
    const rule = resolveRule(route, options);
    const key = `${request.ip}:${route}:${rule.windowMs}`;
    const now = Date.now();
    const windowStart = now - rule.windowMs;
    const bucket = buckets.get(key) ?? { hits: [] };

    bucket.hits = bucket.hits.filter((timestamp) => timestamp > windowStart);

    if (bucket.hits.length >= rule.max) {
      const oldest = bucket.hits[0] ?? now;
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - now) / 1000));
      buckets.set(key, bucket);
      throw Object.assign(errors.rateLimited(), { retryAfterSeconds });
    }

    bucket.hits.push(now);
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, value] of buckets) {
        if (value.hits.length === 0) {
          buckets.delete(bucketKey);
        }
      }
    }
  });

  app.addHook('onSend', async (request: FastifyRequest, reply) => {
    if (reply.raw.statusCode !== 429) {
      return;
    }
    const route = routeKey(request);
    const rule = resolveRule(route, options);
    const bucket = buckets.get(`${request.ip}:${route}:${rule.windowMs}`);
    const oldest = bucket?.hits[0] ?? Date.now();
    const retryAfterSeconds = Math.max(1, Math.ceil((oldest + rule.windowMs - Date.now()) / 1000));
    reply.header('Retry-After', String(retryAfterSeconds));
  });
}

/** Regra efectiva para uma rota: a específica, se existir, ou a global. */
export function resolveRule(route: string, options: RateLimitOptions): RateLimitRule {
  return options.overrides?.[route] ?? { max: options.max, windowMs: options.windowMs };
}

function routeKey(request: FastifyRequest): string {
  const url = request.routeOptions?.url ?? request.url;
  return url.split('?')[0] ?? url;
}