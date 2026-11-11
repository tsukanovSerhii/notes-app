/**
 * In-memory token-bucket rate limiter. Each key (an IP, a sync space) gets
 * `perMinute` tokens that refill continuously, so short bursts are fine and
 * only sustained floods are refused. State lives in the server process, which
 * matches the single-server file repository; a multi-instance deployment
 * would move the buckets to Redis or the database.
 */

export type RateDecision = { ok: true } | { ok: false; retryAfterSec: number };

export interface RateLimiter {
  take(key: string): RateDecision;
}

export interface RateLimiterOptions {
  /** Sustained requests per minute; also the burst size. 0 disables limiting. */
  perMinute: number;
  now?: () => number;
  /** Upper bound on tracked keys, so a flood of addresses cannot grow memory. */
  maxKeys?: number;
}

interface Bucket {
  tokens: number;
  at: number;
}

export function createRateLimiter({
  perMinute,
  now = Date.now,
  maxKeys = 10_000,
}: RateLimiterOptions): RateLimiter {
  if (!(perMinute > 0)) return { take: () => ({ ok: true }) };

  const capacity = perMinute;
  const perMs = perMinute / 60_000;
  const buckets = new Map<string, Bucket>();

  const evict = (t: number) => {
    // Full buckets carry no information; drop them first.
    for (const [key, b] of buckets) {
      if (b.tokens + (t - b.at) * perMs >= capacity) buckets.delete(key);
    }
    // Still too many: drop the least recently used (Map keeps access order).
    for (const key of buckets.keys()) {
      if (buckets.size < maxKeys) break;
      buckets.delete(key);
    }
  };

  return {
    take(key) {
      const t = now();
      const prev = buckets.get(key);
      const tokens = prev ? Math.min(capacity, prev.tokens + (t - prev.at) * perMs) : capacity;
      buckets.delete(key);
      if (!prev && buckets.size >= maxKeys) evict(t);

      if (tokens >= 1) {
        buckets.set(key, { tokens: tokens - 1, at: t });
        return { ok: true };
      }
      buckets.set(key, { tokens, at: t });
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - tokens) / perMs / 1000)) };
    },
  };
}

/**
 * The client address as reported by the reverse proxy. Only trustworthy when
 * a proxy you control sets X-Forwarded-For; without one, every request shares
 * the "unknown" bucket, which still caps the total load.
 */
export function clientAddress(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

export function readPerMinute(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
