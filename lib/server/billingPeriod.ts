/** Canonical monthly billing period (UTC calendar month) — the single
 * source of truth for both quota enforcement and GET /v1/usage, so the two
 * can never silently diverge. */
export function currentMonthBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}
