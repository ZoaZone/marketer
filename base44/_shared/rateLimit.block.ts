/**
 * CANONICAL RATE-LIMIT / BOT-ABUSE BLOCK — server side only.
 *
 * This file is NOT deployed. Base44 function deployments cannot import a
 * shared local module (see base44/_shared/metering.block.ts for the same
 * constraint), so this block is copied verbatim into every public or
 * abuse-prone function between the BEGIN/END markers:
 *   - captureLeadFromForm (public lead-capture form)
 *   - submitBetaRequest   (public signup form)
 *   - sendAuthOTP         (unauthenticated OTP send)
 *   - sendBulkMessage     (authenticated, but the actual bulk-send trigger —
 *                          a per-user/day cap limits blast radius even from
 *                          a legitimate but compromised or abused account)
 *
 * There is no CI drift-checker for this block yet (unlike the metering
 * block, which check-plans.mjs verifies byte-for-byte) — keep copies in
 * sync by hand when this file changes.
 *
 * HONEST LIMITATION: base44 entity storage is a document store queried by
 * exact-match filter, not a counter with atomic increment, and functions
 * are stateless between invocations. checkRateLimit below is therefore a
 * best-effort fixed-window counter (read-then-write, not atomic) — under a
 * concurrent burst a handful of extra requests can slip through the same
 * window. That is a real gap, but it converts "no limit at all" into "a
 * bounded, cheap-to-bypass-by-a-little limit", which is the honest and
 * useful thing to ship here rather than pretending an atomic limiter.
 */

// ── BEGIN RATE LIMIT BLOCK ──────────────────────────────────────────────
function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    (h.get('x-forwarded-for') || '').split(',')[0].trim() ||
    'unknown'
  );
}

/**
 * Fixed-window counter backed by the RateLimitCounter entity (service-role
 * only — see base44/entities/RateLimitCounter.jsonc). `bucket` identifies
 * what's being limited (e.g. "otp_send:203.0.113.4" or
 * "bulk_send_day:user@example.com"); windowMs is floored into the key
 * itself so every caller in the same window lands on the same row — no
 * range query needed, since entity filters here are exact-match only.
 * Returns true (and counts this call) while under `limit`; false once the
 * bucket is full for the rest of the window.
 */
async function checkRateLimit(base44: any, bucket: string, limit: number, windowMs: number): Promise<boolean> {
  const windowIndex = Math.floor(Date.now() / windowMs);
  const key = `${bucket}:${windowIndex}`;
  try {
    const rows = await base44.asServiceRole.entities.RateLimitCounter.filter({ key });
    const row = rows?.[0];
    if (!row) {
      await base44.asServiceRole.entities.RateLimitCounter.create({ key, count: 1 });
      return true;
    }
    if (row.count >= limit) return false;
    await base44.asServiceRole.entities.RateLimitCounter.update(row.id, { count: row.count + 1 });
    return true;
  } catch (e) {
    // Fail OPEN on infra trouble (e.g. entity briefly unavailable) — a
    // rate limiter that takes the feature down with it is worse than one
    // that occasionally under-limits during an outage.
    console.warn('checkRateLimit: entity read/write failed, allowing request:', (e as Error).message);
    return true;
  }
}

/**
 * Cloudflare Turnstile verification. No-op (always passes) when
 * TURNSTILE_SECRET_KEY is unset, so this never blocks anything until an
 * operator actually configures it — safe to ship ahead of that config step.
 */
async function verifyTurnstile(token: string | undefined | null, remoteIp: string): Promise<boolean> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) return true; // not configured — no-op by design
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: remoteIp }),
    });
    const data = await res.json();
    return !!data.success;
  } catch (e) {
    // Configured but unreachable — fail CLOSED. Unlike the rate limiter,
    // this is the actual bot gate; failing open would silently disable it.
    console.warn('verifyTurnstile: siteverify request failed, rejecting:', (e as Error).message);
    return false;
  }
}
// ── END RATE LIMIT BLOCK ────────────────────────────────────────────────
