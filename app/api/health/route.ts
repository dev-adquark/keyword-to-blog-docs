import { NextResponse } from "next/server";
import { query } from "@/lib/server/db";
import { getRedis } from "@/lib/server/redis";

export const runtime = "nodejs";

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

  const healthy = checks.db && checks.redis;
  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", checks },
    { status: healthy ? 200 : 503 }
  );
}
