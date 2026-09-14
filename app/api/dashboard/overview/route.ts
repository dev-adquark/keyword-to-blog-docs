import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { listApiKeysForCustomer, getUsageSince } from "@/lib/server/repository";
import { peekDailyUsage } from "@/lib/server/rateLimit";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { user, customer } = await requireSession();
    const plan = getPlan(customer.plan);
    const keys = await listApiKeysForCustomer(customer.id);
    const activeKeys = keys.filter((k) => k.status === "active");

    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const todayUsage = await getUsageSince(customer.id, startOfDay);

    // Daily quota is enforced per API key; show the most-used active key's window
    // (the one closest to its limit) as the headline figure.
    let dailyLimit = plan.requestsPerDay;
    let dailyRemaining = plan.requestsPerDay;
    if (activeKeys.length > 0) {
      const perKey = await Promise.all(
        activeKeys.map((k) => peekDailyUsage(k.id, plan))
      );
      const tightest = perKey.reduce((min, cur) =>
        cur.remaining < min.remaining ? cur : min
      );
      dailyLimit = tightest.limit;
      dailyRemaining = tightest.remaining;
    }

    return NextResponse.json({
      name: user.name,
      email: user.email,
      plan: { id: plan.id, name: plan.name, priceMonthlyUsd: plan.priceMonthlyUsd },
      apiKeyCount: activeKeys.length,
      requestsToday: todayUsage.requests,
      daily: { limit: dailyLimit, remaining: dailyRemaining },
      lastApiRequestAt: activeKeys
        .map((k) => k.last_used_at)
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null,
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authenticated" }, { status });
  }
}
