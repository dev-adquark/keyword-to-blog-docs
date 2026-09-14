import { NextResponse } from "next/server";
import { authenticate } from "@/lib/server/withApiAuth";
import { errorResponse, internalErrorResponse, ApiError } from "@/lib/server/apiErrors";
import { getUsageSince } from "@/lib/server/repository";
import { peekDailyUsage } from "@/lib/server/rateLimit";
import type { UsageResponseV1 } from "@/lib/types";

export const runtime = "nodejs";

function currentMonthBounds(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function GET(req: Request) {
  const auth = await authenticate(req, {
    requiredScope: "usage:read",
    consumeRateLimit: false,
  });
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { requestId, apiKey, customer, plan } = context;

  try {
    const { start, end } = currentMonthBounds();
    const monthly = await getUsageSince(customer.id, start);
    const daily = await peekDailyUsage(apiKey.id, plan);

    const body: UsageResponseV1 = {
      plan: {
        id: plan.id,
        name: plan.name,
        priorityProcessing: plan.priorityProcessing,
        teamSeats: plan.teamSeats,
      },
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      metering: { unit: "word", granularity: "generation" },
      limits: {
        monthlyWords: plan.monthlyWords,
        maxWordsPerRequest: plan.maxWordsPerRequest,
        requestsPerMinute: plan.requestsPerMinute,
      },
      consumed: {
        words: monthly.words,
        requests: monthly.requests,
      },
      remaining: {
        words: Math.max(0, plan.monthlyWords - monthly.words),
        requests: Math.max(0, plan.monthlyRequests - monthly.requests),
      },
      daily: {
        limit: daily.limit,
        used: daily.limit - daily.remaining,
        remaining: daily.remaining,
        resetAt: new Date(daily.resetAt * 1000).toISOString(),
      },
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("X-Request-ID", requestId);
    return res;
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err, requestId);
    return internalErrorResponse(requestId, err);
  }
}
