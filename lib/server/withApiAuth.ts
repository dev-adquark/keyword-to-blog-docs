import "server-only";
import { NextResponse } from "next/server";
import { extractApiKeyFromHeaders, hashApiKey } from "./apiKey";
import {
  findApiKeyByHash,
  findCustomerById,
  findUserById,
  touchApiKeyLastUsed,
  getUsageSince,
  type ApiKeyRow,
  type CustomerRow,
} from "./repository";
import { getPlan, type PlanConfig } from "@/lib/plans";
import { ApiError, errorResponse, internalErrorResponse } from "./apiErrors";
import { checkAndConsumeRateLimit } from "./rateLimit";
import { resolveRequestId } from "./requestId";
import { notifyOwner, recordRepeatedViolation, safeAfter } from "./notifications";
import { currentMonthBounds } from "./billingPeriod";

/** Best-effort owner alert for repeated abuse on one endpoint — never blocks the request. */
function alertOnRepeatedViolation(params: {
  kind: "rate_limit" | "quota";
  customer: CustomerRow;
  endpoint: string;
}): void {
  safeAfter(async () => {
    const { shouldNotify, approxCount, windowMinutes } = await recordRepeatedViolation({
      kind: params.kind,
      key: `${params.customer.id}:${params.endpoint}`,
    });
    if (!shouldNotify) return;

    const user = await findUserById(params.customer.user_id);
    if (!user) return;

    await notifyOwner(
      params.kind === "rate_limit"
        ? {
            type: "REPEATED_RATE_LIMIT",
            userId: user.id,
            email: user.email,
            plan: params.customer.plan,
            endpoint: params.endpoint,
            approxCount,
            windowMinutes,
          }
        : {
            type: "REPEATED_QUOTA_EXCEEDED",
            userId: user.id,
            email: user.email,
            plan: params.customer.plan,
            endpoint: params.endpoint,
            approxCount,
            windowMinutes,
          }
    );
  });
}


export interface ApiAuthContext {
  apiKey: ApiKeyRow;
  customer: CustomerRow;
  plan: PlanConfig;
  requestId: string;
}

/**
 * Authenticates the request, resolves the customer + plan, and — for
 * quota-consuming endpoints — checks the rate limit. Returns either a
 * resolved context or a ready-to-return NextResponse for the caller to
 * short-circuit with.
 */
export async function authenticate(
  req: Request,
  opts: { requiredScope?: string; consumeRateLimit: boolean }
): Promise<
  | { ok: true; context: ApiAuthContext; rateLimitHeaders: Record<string, string> }
  | { ok: false; response: NextResponse }
> {
  const requestId = resolveRequestId(req.headers);

  try {
    const rawKey = extractApiKeyFromHeaders(req.headers);
    if (!rawKey) {
      throw new ApiError("AUTH_MISSING", "API key is required.");
    }

    const keyHash = hashApiKey(rawKey);
    const apiKey = await findApiKeyByHash(keyHash);
    if (!apiKey || apiKey.status !== "active") {
      throw new ApiError("AUTH_INVALID", "Invalid or revoked API key.");
    }

    const customer = await findCustomerById(apiKey.customer_id);
    if (!customer || customer.status !== "active") {
      throw new ApiError("AUTH_INVALID", "Invalid or revoked API key.");
    }

    if (opts.requiredScope && !apiKey.scopes.includes(opts.requiredScope)) {
      throw new ApiError(
        "SCOPE_INSUFFICIENT",
        "This API key does not have permission to access this endpoint."
      );
    }

    const plan = getPlan(customer.plan);

    // Fire-and-forget — last-used tracking should never fail the request.
    touchApiKeyLastUsed(apiKey.id).catch(() => {});

    const endpoint = new URL(req.url).pathname;

    let rateLimitHeaders: Record<string, string> = {};
    if (opts.consumeRateLimit) {
      const { start: periodStart, end: periodEnd } = currentMonthBounds();
      const monthly = await getUsageSince(customer.id, periodStart);
      if (monthly.words >= plan.monthlyWords || monthly.requests >= plan.monthlyRequests) {
        alertOnRepeatedViolation({ kind: "quota", customer, endpoint });
        throw new ApiError(
          "QUOTA_EXCEEDED",
          `Monthly word quota exceeded for plan '${plan.id}'. Upgrade your plan or wait for the next billing period.`,
          {
            monthlyWords: plan.monthlyWords,
            consumedWords: monthly.words,
            monthlyRequests: plan.monthlyRequests,
            consumedRequests: monthly.requests,
            periodEnd: periodEnd.toISOString(),
          }
        );
      }

      const rl = await checkAndConsumeRateLimit(apiKey.id, plan);
      const activeWindow = rl.allowed
        ? rl.day
        : rl.blockedBy === "minute"
          ? rl.minute
          : rl.day;

      rateLimitHeaders = {
        "X-RateLimit-Limit": String(activeWindow.limit),
        "X-RateLimit-Remaining": String(activeWindow.remaining),
        "X-RateLimit-Reset": String(activeWindow.resetAt),
      };

      if (!rl.allowed) {
        alertOnRepeatedViolation({ kind: "rate_limit", customer, endpoint });
        const retryAfter = Math.max(
          1,
          activeWindow.resetAt - Math.floor(Date.now() / 1000)
        );
        throw new ApiError(
          "RATE_LIMITED",
          rl.blockedBy === "minute"
            ? "Too many requests per minute. Please slow down."
            : "Daily API request limit reached.",
          {
            limit: activeWindow.limit,
            remaining: activeWindow.remaining,
            resetAt: new Date(activeWindow.resetAt * 1000).toISOString(),
          },
          { ...rateLimitHeaders, "Retry-After": String(retryAfter) }
        );
      }
    }

    return {
      ok: true,
      context: { apiKey, customer, plan, requestId },
      rateLimitHeaders,
    };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, response: errorResponse(err, requestId) };
    }
    return { ok: false, response: internalErrorResponse(requestId, err) };
  }
}
