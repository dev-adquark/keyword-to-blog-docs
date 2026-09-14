import "server-only";
import { NextResponse } from "next/server";
import { extractApiKeyFromHeaders, hashApiKey } from "./apiKey";
import {
  findApiKeyByHash,
  findCustomerById,
  touchApiKeyLastUsed,
  type ApiKeyRow,
  type CustomerRow,
} from "./repository";
import { getPlan, type PlanConfig } from "@/lib/plans";
import { ApiError, errorResponse, internalErrorResponse } from "./apiErrors";
import { checkAndConsumeRateLimit } from "./rateLimit";
import { resolveRequestId } from "./requestId";

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

    let rateLimitHeaders: Record<string, string> = {};
    if (opts.consumeRateLimit) {
      const rl = await checkAndConsumeRateLimit(apiKey.id, plan);
      rateLimitHeaders = {
        "X-RateLimit-Limit": String(rl.day.limit),
        "X-RateLimit-Remaining": String(rl.day.remaining),
        "X-RateLimit-Reset": String(rl.day.resetAt),
      };
      if (!rl.allowed) {
        const activeWindow = rl.blockedBy === "minute" ? rl.minute : rl.day;
        const retryAfter = Math.max(1, activeWindow.resetAt - Math.floor(Date.now() / 1000));
        throw new ApiError(
          "RATE_LIMITED",
          rl.blockedBy === "minute"
            ? "Too many requests per minute. Please slow down."
            : "Daily API request limit reached.",
          {
            limit: activeWindow.limit,
            remaining: 0,
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
