import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { getRedis } from "@/lib/server/redis";
import { qstashConfigured, notificationsConfigured } from "@/lib/server/env";

export const runtime = "nodejs";

/**
 * Liveness/config check. `checks` are real connectivity tests and gate the
 * overall status; `config` is presence-only (never a live call, never a
 * value) so external-service setup can be verified without spending an
 * Anthropic request or needing dashboard access.
 */
export async function GET() {
  const checks: { db: boolean; redis: boolean } = { db: false, redis: false };

  try {
    await query("SELECT 1");
    checks.db = true;
  } catch {
    checks.db = false;
  }

  try {
    await getRedis().ping();
    checks.redis = true;
  } catch {
    checks.redis = false;
  }

  const config = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    resend: notificationsConfigured(),
    qstash: qstashConfigured(),
  };

  const healthy = checks.db && checks.redis;
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks, config },
    { status: healthy ? 200 : 503 }
  );
}
