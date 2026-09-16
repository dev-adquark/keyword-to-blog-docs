import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/server/rbac";
import {
  findApiKeyWithOwnerById,
  getUsageSinceForApiKey,
  listRecentUsageEventsForApiKey,
} from "@/lib/server/repository";
import { currentMonthBounds } from "@/lib/server/billingPeriod";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  try {
    await requireOwnerSession();
    const { keyId } = await params;

    const key = await findApiKeyWithOwnerById(keyId);
    if (!key) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const { start: monthStart } = currentMonthBounds();
    const [today, month, recent] = await Promise.all([
      getUsageSinceForApiKey(keyId, (() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        return d;
      })()),
      getUsageSinceForApiKey(keyId, monthStart),
      listRecentUsageEventsForApiKey(keyId, 25),
    ]);

    return NextResponse.json({
      key: {
        id: key.id,
        name: key.name,
        prefix: key.key_prefix,
        environment: key.environment,
        status: key.status,
        createdAt: key.created_at,
        lastUsedAt: key.last_used_at,
        revokedAt: key.revoked_at,
        owner: { id: key.user_id, email: key.user_email, name: key.user_name },
      },
      usage: {
        requestsToday: today.requests,
        wordsToday: today.words,
        postsToday: today.posts,
        requestsThisMonth: month.requests,
        wordsThisMonth: month.words,
        postsThisMonth: month.posts,
        failedThisMonth: month.failed,
        rateLimitedThisMonth: month.rateLimited,
      },
      recentRequests: recent.map((e) => ({
        id: e.id,
        createdAt: e.created_at,
        endpoint: e.endpoint,
        statusCode: e.status_code,
        success: e.success,
        words: e.words,
        posts: e.posts,
        durationMs: e.duration_ms,
      })),
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authorized." }, { status });
  }
}
