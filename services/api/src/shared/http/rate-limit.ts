import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAuthenticatedUserId } from '../../modules/auth/auth.service.js';
import { env } from '../config/env.js';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

export interface InMemoryRateLimiter {
  consume: (key: string, nowMs?: number) => RateLimitDecision;
  cleanup: (nowMs?: number) => number;
  size: () => number;
}

function normalizeInteger(value: number, fallback: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

export function createInMemoryRateLimiter(config: {
  limit: number;
  windowMs: number;
}): InMemoryRateLimiter {
  const limit = normalizeInteger(config.limit, 120);
  const windowMs = normalizeInteger(config.windowMs, 60_000);
  const buckets = new Map<string, RateLimitBucket>();

  function consume(key: string, nowMs = Date.now()): RateLimitDecision {
    const existing = buckets.get(key);

    if (!existing || nowMs >= existing.resetAt) {
      const resetAt = nowMs + windowMs;
      buckets.set(key, { count: 1, resetAt });

      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: 0,
        resetAt,
      };
    }

    existing.count += 1;

    if (existing.count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - nowMs) / 1000)),
        resetAt: existing.resetAt,
      };
    }

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - existing.count),
      retryAfterSeconds: 0,
      resetAt: existing.resetAt,
    };
  }

  function cleanup(nowMs = Date.now()): number {
    let removed = 0;

    for (const [key, bucket] of buckets.entries()) {
      if (nowMs >= bucket.resetAt) {
        buckets.delete(key);
        removed += 1;
      }
    }

    return removed;
  }

  return {
    consume,
    cleanup,
    size: () => buckets.size,
  };
}

function resolveRequesterKey(request: FastifyRequest): string {
  try {
    const userId = requireAuthenticatedUserId(request.headers.authorization);
    return `user:${userId}`;
  } catch {
    return `ip:${request.ip ?? 'unknown'}`;
  }
}

function applyRateLimitHeaders(reply: FastifyReply, decision: RateLimitDecision): void {
  reply.header('X-RateLimit-Limit', String(decision.limit));
  reply.header('X-RateLimit-Remaining', String(decision.remaining));
  reply.header('X-RateLimit-Reset', String(Math.ceil(decision.resetAt / 1000)));
}

export function registerApiRateLimit(app: FastifyInstance): void {
  const limiter = createInMemoryRateLimiter({
    limit: env.RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
  });

  let requestsSinceCleanup = 0;

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) {
      return;
    }

    const decision = limiter.consume(resolveRequesterKey(request));
    applyRateLimitHeaders(reply, decision);

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 1000) {
      limiter.cleanup();
      requestsSinceCleanup = 0;
    }

    if (decision.allowed) {
      return;
    }

    reply.header('Retry-After', String(decision.retryAfterSeconds));

    return reply.status(429).send({
      error: 'RateLimitExceeded',
      message: `Too many requests. Retry in ${decision.retryAfterSeconds} second(s).`,
    });
  });
}
