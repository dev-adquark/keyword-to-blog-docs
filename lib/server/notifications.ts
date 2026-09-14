import "server-only";
import { after } from "next/server";
import { env, notificationsConfigured } from "./env";
import { getRedis } from "./redis";

/**
 * Schedules `fn` to run after the response is sent, via Next's `after()`.
 * `after()` throws synchronously when called outside a real request scope
 * (e.g. a unit test that calls a route/lib function directly rather than
 * through the Next.js server) — never let that break the caller, since a
 * notification is never allowed to affect the primary request.
 */
export function safeAfter(fn: () => Promise<void>): void {
  try {
    after(fn);
  } catch {
    // No active request scope to attach to — skip silently.
  }
}

/**
 * Owner-only email notifications (via Resend). A no-op whenever
 * RESEND_API_KEY / OWNER_NOTIFICATION_EMAIL aren't both set — callers never
 * need to check `notificationsConfigured()` themselves. Every send is
 * best-effort: failures are logged server-side and never thrown, so a
 * notification can never break the request that triggered it.
 */

export type NotificationEvent =
  | {
      type: "USER_SIGNED_UP";
      userId: string;
      email: string;
      name: string;
      plan: string;
      signedUpAt: string;
    }
  | {
      type: "API_KEY_CREATED";
      userId: string;
      email: string;
      name: string;
      plan: string;
      apiKeyId: string;
      keyPrefix: string;
      environment: string;
      createdAt: string;
    }
  | {
      type: "UPGRADE_REQUESTED";
      userId: string;
      email: string;
      name: string;
      currentPlan: string;
      requestedPlan: string;
      reason?: string;
      requestId: string;
      requestedAt: string;
    }
  | {
      type: "REPEATED_RATE_LIMIT";
      userId: string;
      email: string;
      plan: string;
      endpoint: string;
      windowMinutes: number;
      approxCount: number;
    }
  | {
      type: "REPEATED_QUOTA_EXCEEDED";
      userId: string;
      email: string;
      plan: string;
      endpoint: string;
      windowMinutes: number;
      approxCount: number;
    }
  | {
      type: "SUSPICIOUS_LOGIN_FAILURES";
      email: string;
      approxCount: number;
      windowMinutes: number;
    };

function renderEmail(event: NotificationEvent): { subject: string; text: string } {
  switch (event.type) {
    case "USER_SIGNED_UP":
      return {
        subject: "New Keyword-to-Blog API user signup",
        text: [
          `Name: ${event.name}`,
          `Email: ${event.email}`,
          `User ID: ${event.userId}`,
          `Plan: ${event.plan}`,
          `Signed up at: ${event.signedUpAt}`,
        ].join("\n"),
      };
    case "API_KEY_CREATED":
      return {
        subject: "Keyword-to-Blog API key created",
        text: [
          `User: ${event.name}`,
          `Email: ${event.email}`,
          `Key: ${event.keyPrefix}… (${event.environment})`,
          `API key ID: ${event.apiKeyId}`,
          `Plan: ${event.plan}`,
          `Created at: ${event.createdAt}`,
        ].join("\n"),
      };
    case "UPGRADE_REQUESTED":
      return {
        subject: "Keyword-to-Blog API upgrade request",
        text: [
          `User: ${event.name}`,
          `Email: ${event.email}`,
          `Current plan: ${event.currentPlan}`,
          `Requested plan: ${event.requestedPlan}`,
          `Reason: ${event.reason || "(none given)"}`,
          `Request ID: ${event.requestId}`,
          `Requested at: ${event.requestedAt}`,
        ].join("\n"),
      };
    case "REPEATED_RATE_LIMIT":
      return {
        subject: "Keyword-to-Blog API: repeated rate-limit violations",
        text: [
          `User: ${event.email}`,
          `Plan: ${event.plan}`,
          `Endpoint: ${event.endpoint}`,
          `Approx. ${event.approxCount} rate-limit rejections in the last ${event.windowMinutes} minutes.`,
        ].join("\n"),
      };
    case "REPEATED_QUOTA_EXCEEDED":
      return {
        subject: "Keyword-to-Blog API: repeated quota-exceeded attempts",
        text: [
          `User: ${event.email}`,
          `Plan: ${event.plan}`,
          `Endpoint: ${event.endpoint}`,
          `Approx. ${event.approxCount} quota-exceeded attempts in the last ${event.windowMinutes} minutes.`,
        ].join("\n"),
      };
    case "SUSPICIOUS_LOGIN_FAILURES":
      return {
        subject: "Keyword-to-Blog API: repeated failed login attempts",
        text: [
          `Email attempted: ${event.email}`,
          `Approx. ${event.approxCount} failed login attempts in the last ${event.windowMinutes} minutes.`,
        ].join("\n"),
      };
  }
}

/** Sends one owner-notification email. Never throws — logs and swallows any failure. */
export async function notifyOwner(event: NotificationEvent): Promise<void> {
  if (!notificationsConfigured()) return;

  try {
    const { subject, text } = renderEmail(event);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [env.OWNER_NOTIFICATION_EMAIL],
        subject,
        text,
      }),
    });

    if (!res.ok) {
      console.error(
        JSON.stringify({
          level: "error",
          message: "owner_notification_failed",
          event: event.type,
          status: res.status,
        })
      );
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "owner_notification_error",
        event: event.type,
        error: err instanceof Error ? err.message : String(err),
      })
    );
  }
}

// ---------- Repeated-violation deduplication ----------
//
// Redis-backed, atomic, and reused from the same Upstash instance the rate
// limiter already depends on — no new infrastructure. A rolling counter
// tracks violations within WINDOW_SECONDS; once it crosses THRESHOLD, at
// most one notification fires per COOLDOWN_SECONDS (an atomic SET NX EX
// guard), so a user hammering an endpoint produces one email, not hundreds.

const VIOLATION_WINDOW_SECONDS = 15 * 60;
const VIOLATION_THRESHOLD = 5;
const VIOLATION_COOLDOWN_SECONDS = 60 * 60;

export async function recordRepeatedViolation(params: {
  kind: "rate_limit" | "quota" | "login_failure";
  key: string;
}): Promise<{ shouldNotify: boolean; approxCount: number; windowMinutes: number }> {
  const windowMinutes = VIOLATION_WINDOW_SECONDS / 60;
  if (!notificationsConfigured()) {
    return { shouldNotify: false, approxCount: 0, windowMinutes };
  }

  try {
    const redis = getRedis();
    const countKey = `notif:violation:${params.kind}:${params.key}`;
    const cooldownKey = `notif:cooldown:${params.kind}:${params.key}`;

    const count = await redis.incr(countKey);
    if (count === 1) {
      await redis.expire(countKey, VIOLATION_WINDOW_SECONDS);
    }

    if (count < VIOLATION_THRESHOLD) {
      return { shouldNotify: false, approxCount: count, windowMinutes };
    }

    const claimed = await redis.set(cooldownKey, "1", {
      nx: true,
      ex: VIOLATION_COOLDOWN_SECONDS,
    });

    return { shouldNotify: Boolean(claimed), approxCount: count, windowMinutes };
  } catch {
    // Deduplication is best-effort too — never let it block or throw.
    return { shouldNotify: false, approxCount: 0, windowMinutes };
  }
}
