import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/server/rbac";
import {
  listUsersWithCustomers,
  listApiKeysWithOwners,
  getUsageSince,
  listRecentUsageEventsForTeam,
} from "@/lib/server/repository";
import { currentMonthBounds } from "@/lib/server/billingPeriod";

export const runtime = "nodejs";

function startOfUtcDay(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function GET() {
  try {
    await requireOwnerSession();

    const [users, keys] = await Promise.all([listUsersWithCustomers(), listApiKeysWithOwners()]);
    const todayStart = startOfUtcDay();
    const { start: monthStart } = currentMonthBounds();

    const memberData = await Promise.all(
      users.map(async (u) => {
        const memberKeys = keys.filter((k) => k.customer_id === u.customer_id);
        const activeKeys = memberKeys.filter((k) => k.status === "active");

        const [today, month] = u.customer_id
          ? await Promise.all([
              getUsageSince(u.customer_id, todayStart),
              getUsageSince(u.customer_id, monthStart),
            ])
          : [
              { requests: 0, words: 0, posts: 0 },
              { requests: 0, words: 0, posts: 0 },
            ];

        const lastActivityAt = memberKeys
          .map((k) => k.last_used_at)
          .filter(Boolean)
          .sort()
          .reverse()[0] ?? null;

        return {
          today,
          member: {
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            status: u.status,
            createdAt: u.created_at,
            lastLoginAt: u.last_login_at,
            apiKeyCount: memberKeys.length,
            activeApiKeyCount: activeKeys.length,
            requestsToday: today.requests,
            requestsThisMonth: month.requests,
            postsGenerated: month.posts,
            wordsGenerated: month.words,
            lastActivityAt,
          },
        };
      })
    );
    const members = memberData.map((m) => m.member);

    const recentActivity = await listRecentUsageEventsForTeam(100);

    const summary = {
      requestsToday: memberData.reduce((sum, m) => sum + m.today.requests, 0),
      postsToday: memberData.reduce((sum, m) => sum + m.today.posts, 0),
      wordsToday: memberData.reduce((sum, m) => sum + m.today.words, 0),
      rateLimitedToday: recentActivity.filter(
        (e) => new Date(e.created_at) >= todayStart && e.status_code === 429
      ).length,
      activeMembers: members.filter((m) => m.status === "active").length,
      activeApiKeys: keys.filter((k) => k.status === "active").length,
    };

    return NextResponse.json({
      members,
      summary,
      recentActivity: recentActivity.slice(0, 20).map((e) => ({
        id: e.id,
        createdAt: e.created_at,
        userEmail: e.user_email,
        keyPrefix: e.key_prefix,
        endpoint: e.endpoint,
        statusCode: e.status_code,
        success: e.success,
        words: e.words,
        posts: e.posts,
      })),
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authorized." }, { status });
  }
}
