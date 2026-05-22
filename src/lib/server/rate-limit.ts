/**
 * Tiny in-memory sliding-window rate limiter. Sufficient for single-instance
 * Node deployments (Vercel serverless: each cold-start gets fresh state, which
 * means the per-IP cap is per-instance — fine for normal use, weak under
 * coordinated abuse).
 *
 * For multi-instance / strict guarantees, swap for Upstash Redis or KV.
 */

interface Bucket {
  /** Timestamps (ms) of requests inside the current window. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Check + record a request. Returns true if allowed, false if over the limit.
 *
 * @param key   Stable identifier — typically `${routeName}:${ip}` or `:${userId}`
 * @param max   Maximum requests allowed
 * @param windowMs Window length in milliseconds
 */
export function rateLimit(
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const cutoff = now - windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => t > cutoff);

  if (bucket.hits.length >= max) {
    const oldest = bucket.hits[0];
    const retryAfterSec = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSec };
  }

  bucket.hits.push(now);
  return {
    allowed: true,
    remaining: max - bucket.hits.length,
    retryAfterSec: 0,
  };
}

/**
 * Extract a stable per-client identifier from the request — prefers Supabase
 * session user ID (set by middleware) over IP. Falls back to remote IP.
 */
export function clientKey(
  req: Request,
  userId: string | null | undefined,
  routeName: string,
): string {
  if (userId) return `${routeName}:user:${userId}`;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return `${routeName}:ip:${ip}`;
}

/**
 * Periodically prune empty buckets. Called automatically on every rateLimit()
 * if the map gets large. Not strictly necessary for correctness.
 */
function maybePrune() {
  if (buckets.size < 1000) return;
  const cutoff = Date.now() - 60 * 60 * 1000; // 1h idle
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1] < cutoff) {
      buckets.delete(k);
    }
  }
}
// Lightweight cleanup hook — fire on every Nth call
let counter = 0;
const origRL = rateLimit;
export function rateLimitWithPrune(
  key: string,
  max: number,
  windowMs: number,
): ReturnType<typeof origRL> {
  counter++;
  if (counter % 500 === 0) maybePrune();
  return origRL(key, max, windowMs);
}
