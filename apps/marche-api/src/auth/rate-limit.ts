// Per-IP, fixed-window rate limiting for the WhatsApp sign-in routes that can be hammered
// (`start`: opens a nonce for free; `verify`: guesses a 6-digit code) -- see migrations/0002_auth.sql.
//
// Backed by a small D1 table rather than the Workers Rate Limiting binding, for two reasons:
//   1. This Worker already depends on D1 for everything else; a D1 table needs no new binding,
//      no separate production-only setup, and works identically in every environment.
//   2. It is fully exercised by `@cloudflare/vitest-pool-workers`' local D1 in tests (see
//      test/auth.test.ts) -- the Rate Limiting binding has no equivalent local simulation there,
//      so a binding-based limiter would be the one piece of this feature untested in CI.
// Tradeoff: old counter rows accumulate (one per bucket per window) instead of expiring the way
// the binding would. Fine at Marché's scale; worth a scheduled DELETE ... WHERE bucket < ... if
// this table ever grows large enough to matter.

const WINDOW_SECONDS = 600; // 10-minute fixed windows

/**
 * Records one attempt at `route` from `ip` and returns whether it's still within `limit` for the
 * current 10-minute window. The record always happens, allowed or not, so a caller only needs
 * one call per request -- there is no separate "record" step.
 */
export async function checkRateLimit(db: D1Database, route: string, ip: string, limit: number): Promise<boolean> {
  const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const bucket = `${route}:${ip}:${windowStart}`;
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count) VALUES (?, 1)
       ON CONFLICT(bucket) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(bucket)
    .first<{ count: number }>();
  return (row?.count ?? 1) <= limit;
}
