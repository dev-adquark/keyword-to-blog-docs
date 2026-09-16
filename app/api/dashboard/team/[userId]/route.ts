import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/server/rbac";
import {
  findUserWithCustomerById,
  listApiKeysWithOwners,
  getUsageSince,
  getJobCountsByStatus,
} from "@/lib/server/repository";
import { currentMonthBounds } from "@/lib/server/billingPeriod";

export const runtime = "nodejs";

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET(_req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    await requireOwnerSession();
    const { userId } = await params;

    const user = await findUserWithCustomerById(userId);
    if (!user) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    const allKeys = await listApiKeysWithOwners();
    const memberKeys = allKeys.filter((k) => k.customer_id === user.customer_id);

    const { start: monthStart } = currentMonthBounds();
    const [today, month, jobCounts] = user.customer_id
      ? await Promise.all([
          getUsageSince(user.customer_id, startOfUtcDay()),
          getUsageSince(user.customer_id, monthStart),
          getJobCountsByStatus(user.customer_id),
        ])
      : [
          { requests: 0, words: 0, posts: 0 },
          { requests: 0, words: 0, posts: 0 },
          { queued: 0, processing: 0, succeeded: 0, failed: 0 },
        ];

    return NextResponse.json({
      profile: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.created_at,
        lastLoginAt: user.last_login_at,
      },
      apiKeys: memberKeys.map((k) => ({
        id: k.id,
        name: k.name,
        prefix: k.key_prefix,
        environment: k.environment,
        status: k.status,
        createdAt: k.created_at,
        lastUsedAt: k.last_used_at,
      })),
      activeKeyCount: memberKeys.filter((k) => k.status === "active").length,
      revokedKeyCount: memberKeys.filter((k) => k.status === "revoked").length,
      usage: {
        requestsToday: today.requests,
        wordsToday: today.words,
        postsToday: today.posts,
        requestsThisMonth: month.requests,
        wordsThisMonth: month.words,
        postsThisMonth: month.posts,
      },
      jobs: jobCounts,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authorized." }, { status });
  }
}
