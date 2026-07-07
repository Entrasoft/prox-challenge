/**
 * In-memory per-IP rate limiter for the public demo — caps API cost from a
 * runaway client. Per-instance (fine for a single Cloud Run instance / small
 * demo; a shared store would be needed for multi-instance strict limits).
 */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

const LIMIT = 25; // requests
const WINDOW_MS = 5 * 60 * 1000; // per 5 minutes

export function rateLimit(ip: string): { ok: boolean; retryAfter: number; remaining: number } {
  const now = Date.now();
  // Opportunistic cleanup so the map can't grow unbounded.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  }
  let b = buckets.get(ip);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(ip, b);
  }
  b.count += 1;
  if (b.count > LIMIT) return { ok: false, retryAfter: Math.ceil((b.resetAt - now) / 1000), remaining: 0 };
  return { ok: true, retryAfter: 0, remaining: LIMIT - b.count };
}

/** Best-effort client IP from proxy headers (Cloudflare / Cloud Run). */
export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "local"
  );
}
