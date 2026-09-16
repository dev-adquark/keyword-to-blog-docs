import "server-only";

/**
 * Central environment validation. Import this (not process.env directly) from
 * any server-side code that needs one of these values, so misconfiguration
 * fails clearly instead of producing `undefined` deep inside a request.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export const env = {
  get DATABASE_URL() {
    return required("DATABASE_URL");
  },
  get AUTH_SECRET() {
    return required("AUTH_SECRET");
  },
  get ANTHROPIC_API_KEY() {
    return required("ANTHROPIC_API_KEY");
  },
  get AI_MODEL() {
    // Haiku by default — lowest token cost suitable for this product; override via env if needed.
    return optional("AI_MODEL", "claude-haiku-4-5-20251001");
  },
  get UPSTASH_REDIS_REST_URL() {
    return required("UPSTASH_REDIS_REST_URL");
  },
  get UPSTASH_REDIS_REST_TOKEN() {
    return required("UPSTASH_REDIS_REST_TOKEN");
  },
  get QSTASH_TOKEN() {
    return process.env.QSTASH_TOKEN || "";
  },
  get QSTASH_CURRENT_SIGNING_KEY() {
    return process.env.QSTASH_CURRENT_SIGNING_KEY || "";
  },
  get QSTASH_NEXT_SIGNING_KEY() {
    return process.env.QSTASH_NEXT_SIGNING_KEY || "";
  },
  get NEXT_PUBLIC_API_BASE_URL() {
    return optional("NEXT_PUBLIC_API_BASE_URL", "http://localhost:3000");
  },
  get NODE_ENV() {
    return process.env.NODE_ENV || "development";
  },
  /** Optional — owner-notification emails are a no-op until both are set. */
  get RESEND_API_KEY() {
    return process.env.RESEND_API_KEY || "";
  },
  get OWNER_NOTIFICATION_EMAIL() {
    return process.env.OWNER_NOTIFICATION_EMAIL || "";
  },
  /** Resend's shared sender for accounts without a verified sending domain yet. */
  get RESEND_FROM_EMAIL() {
    return optional("RESEND_FROM_EMAIL", "onboarding@resend.dev");
  },
  /** Max automatic-revision attempts before CONTENT_QUALITY_FAILED. */
  get CONTENT_QUALITY_MAX_REVISIONS() {
    const raw = process.env.CONTENT_QUALITY_MAX_REVISIONS;
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 2;
  },
  /** Model used for LLM-based quality evaluation — defaults to the same
   * generation model so no extra config is required to get this feature. */
  get CONTENT_QUALITY_EVALUATOR_MODEL() {
    return process.env.CONTENT_QUALITY_EVALUATOR_MODEL || env.AI_MODEL;
  },
};

/** Whether durable async job delivery (QStash) is configured. */
export function qstashConfigured(): boolean {
  return Boolean(
    process.env.QSTASH_TOKEN &&
      process.env.QSTASH_CURRENT_SIGNING_KEY &&
      process.env.QSTASH_NEXT_SIGNING_KEY
  );
}

/** Whether owner-notification email delivery is configured. */
export function notificationsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.OWNER_NOTIFICATION_EMAIL);
}
