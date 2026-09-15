import "server-only";
import { getRedis } from "./redis";
import type { PlanConfig } from "@/lib/plans";

/**
 * Atomic check-and-increment: increments the counter, and if it exceeds the
 * limit, immediately decrements it back so a blocked request never actually
 * consumes quota. This runs as a single Lua script server-side in Redis, so
 * it stays correct even when many serverless instances hit the same key at
 * once (no read-then-write race).
 */
const CHECK_AND_INCREMENT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
local limit = tonumber(ARGV[1])
if current > limit then
  redis.call("DECR", KEYS[1])
  return {0, limit, 0}
end
return {1, limit, limit - current}
`;

export interface RateLimitWindowResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number; // unix seconds
}

export interface RateLimitResult {
  allowed: boolean;
  minute: RateLimitWindowResult;
  day: RateLimitWindowResult;
  /** Which window blocked the request, if any. */
  blockedBy?: "minute" | "day";
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function secondsUntilNextUtcMidnight(d: Date): number {
  const next = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 0, 0, 0)
  );
  return Math.max(1, Math.round((next.getTime() - d.getTime()) / 1000));
}

function nextUtcMidnightUnix(d: Date): number {
  return Math.floor(d.getTime() / 1000) + secondsUntilNextUtcMidnight(d);
}

function minuteBucket(d: Date): string {
  return Math.floor(d.getTime() / 60_000).toString();
}

function nextMinuteBoundaryUnix(d: Date): number {
  return (Math.floor(d.getTime() / 60_000) + 1) * 60;
}

async function checkWindow(
  key: string,
  limit: number,
  ttlSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  const redis = getRedis();
  const [allowed, , remaining] = (await redis.eval(
    CHECK_AND_INCREMENT_SCRIPT,
    [key],
    [String(limit), String(ttlSeconds)]
  )) as [number, number, number];
  return { allowed: allowed === 1, remaining };
}

/**
 * Checks + consumes one unit of both the per-minute and per-day quota for
 * this API key. Evaluates the cheaper/short window first; if either window
 * is exhausted, the request is blocked and nothing is left over-consumed.
 */
export async function checkAndConsumeRateLimit(
  apiKeyId: string,
  plan: PlanConfig
): Promise<RateLimitResult> {
  const now = new Date();

  const minuteKey = `rl:min:${apiKeyId}:${minuteBucket(now)}`;
  const minuteCheck = await checkWindow(minuteKey, plan.requestsPerMinute, 65);
  const minuteReset = nextMinuteBoundaryUnix(now);

  if (!minuteCheck.allowed) {
    // Still need day.remaining for informative headers, without consuming it.
    const dayKey = `rl:day:${apiKeyId}:${utcDateString(now)}`;
    const dayRemaining = await peekRemaining(dayKey, plan.requestsPerDay);
    return {
      allowed: false,
      blockedBy: "minute",
      minute: {
        allowed: false,
        limit: plan.requestsPerMinute,
        remaining: 0,
        resetAt: minuteReset,
      },
      day: {
        allowed: true,
        limit: plan.requestsPerDay,
        remaining: dayRemaining,
        resetAt: nextUtcMidnightUnix(now),
      },
    };
  }

  const dayKey = `rl:day:${apiKeyId}:${utcDateString(now)}`;
  const dayCheck = await checkWindow(
    dayKey,
    plan.requestsPerDay,
    secondsUntilNextUtcMidnight(now)
  );
  const dayReset = nextUtcMidnightUnix(now);

  if (!dayCheck.allowed) {
    // Give back the minute-window unit we just consumed, since the request
    // is being blocked by the day quota instead.
    await getRedis().decr(minuteKey);
    return {
      allowed: false,
      blockedBy: "day",
      minute: {
        allowed: true,
        limit: plan.requestsPerMinute,
        remaining: minuteCheck.remaining + 1,
        resetAt: minuteReset,
      },
      day: {
        allowed: false,
        limit: plan.requestsPerDay,
        remaining: 0,
        resetAt: dayReset,
      },
    };
  }

  return {
    allowed: true,
    minute: {
      allowed: true,
      limit: plan.requestsPerMinute,
      remaining: minuteCheck.remaining,
      resetAt: minuteReset,
    },
    day: {
      allowed: true,
      limit: plan.requestsPerDay,
      remaining: dayCheck.remaining,
      resetAt: dayReset,
    },
  };
}

async function peekRemaining(key: string, limit: number): Promise<number> {
  const redis = getRedis();
  const current = (await redis.get<number>(key)) ?? 0;
  return Math.max(0, limit - Number(current));
}

/** Read-only lookup used by GET /v1/usage — does not consume quota. */
export async function peekDailyUsage(
  apiKeyId: string,
  plan: PlanConfig
): Promise<RateLimitWindowResult> {
  const now = new Date();
  const dayKey = `rl:day:${apiKeyId}:${utcDateString(now)}`;
  const remaining = await peekRemaining(dayKey, plan.requestsPerDay);
  return {
    allowed: remaining > 0,
    limit: plan.requestsPerDay,
    remaining,
    resetAt: nextUtcMidnightUnix(now),
  };
}

// ---------- Generic abuse rate limiting (auth endpoints, not tied to a plan) ----------
//
// Unlike the paid-API quota limiter above (which must fail closed — a Redis
// outage must never grant unlimited paid usage), these guard signup/login/
// OTP abuse as defense-in-depth on top of real auth checks (password
// verification, per-OTP attempt caps). Failing closed here would turn a
// Redis hiccup into a total signup/login outage, which is worse than
// briefly losing the extra abuse layer — so these fail OPEN, loudly logged.

/** Atomic fixed-window counter for any key — signup/login/OTP abuse limits, etc.
 * Fails open (allowed: true) if Redis itself is unreachable. */
export async function consumeFixedWindowLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number }> {
  try {
    return await checkWindow(key, limit, windowSeconds);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "rate_limit_check_failed_open",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return { allowed: true, remaining: limit };
  }
}

/** Atomic cooldown gate: true the first time within `seconds`, false while
 * still cooling down. Fails open (true) if Redis itself is unreachable. */
export async function consumeCooldown(key: string, seconds: number): Promise<boolean> {
  try {
    const redis = getRedis();
    const claimed = await redis.set(key, "1", { nx: true, ex: seconds });
    return Boolean(claimed);
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "cooldown_check_failed_open",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return true;
  }
}
