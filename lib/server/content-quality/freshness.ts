import "server-only";
import type { FailedCheck, FreshnessStatus, GenerateRequestV1, SEOPostV1 } from "@/lib/types";
import { collectSectionProse } from "./textStats";

/**
 * Detects freshness-sensitive topics (current prices, versions, laws,
 * "latest" anything, recent events) and checks whether the generated text
 * makes an unqualified current-state claim it can't actually back up.
 *
 * Unlike the old (pre-web-search) version of this check, this deployment can
 * now actually ground such claims in a live web_search result from the same
 * generation/repair call (see lib/server/generation/anthropic.ts). So the
 * question this file answers is no longer "did the model hedge enough
 * wording?" — it's "was this specific current-state claim actually backed by
 * a search result verified as published TODAY?" Per the strict freshness
 * policy, a source from yesterday or earlier does NOT count — there is no
 * "close enough" fallback. Only a claim genuinely grounded in a today-dated
 * source passes; everything else is blocked unconditionally (not only in
 * factualityMode: "verified"), because there is no honest reason to let an
 * ungrounded or stale currency claim through by default when real,
 * date-verified grounding is available.
 */
export interface FreshnessResult {
  status: FreshnessStatus;
  failedChecks: FailedCheck[];
  warnings: string[];
}

const FRESHNESS_SENSITIVE_TOPIC_SIGNALS = [
  "price",
  "pricing",
  "cost",
  "version",
  "release",
  "update",
  "law",
  "regulation",
  "policy",
  "statistics",
  "latest",
  "current",
  "news",
  "market",
  "trend",
  "trending",
  "breaking",
  "announcement",
  "recent",
  "recently",
  "today",
  "this year",
];

const UNQUALIFIED_CURRENT_CLAIM_PATTERNS = [
  /\bthe latest version is\b/i,
  /\bcurrently costs?\b/i,
  /\bas of (?:today|now|writing|this (?:year|month|week))\b/i,
  /\bas of \d{4}\b/i,
  /\bthe current (?:price|version|law|policy|rate) is\b/i,
  /\bright now,? (?:the|it|prices?)\b/i,
  /\btoday,? (?:the|prices?|rates?)\b/i,
  /\bjust (?:announced|launched|released)\b/i,
  /\bthis year'?s\b/i,
];

/** Exported so the generation provider can decide, before spending an
 * Anthropic call, whether the request is worth enabling (billed) web search
 * for — see lib/server/generation/anthropic.ts. */
export function isFreshnessSensitive(request: GenerateRequestV1): boolean {
  const haystack = [request.topic ?? "", ...request.keywords].join(" ").toLowerCase();
  return FRESHNESS_SENSITIVE_TOPIC_SIGNALS.some((signal) => haystack.includes(signal));
}

export function evaluateFreshness(
  request: GenerateRequestV1,
  post: SEOPostV1,
  grounding: { groundedInSearch: boolean; groundedInTodaySource: boolean }
): FreshnessResult {
  if (!isFreshnessSensitive(request)) {
    return { status: "NOT_APPLICABLE", failedChecks: [], warnings: [] };
  }

  const allText = [post.title, ...collectSectionProse(post.sections), post.conclusion].join(" ");
  const unqualifiedClaims = UNQUALIFIED_CURRENT_CLAIM_PATTERNS.filter((p) => p.test(allText));

  if (unqualifiedClaims.length === 0) {
    return grounding.groundedInTodaySource
      ? { status: "VERIFIED_CURRENT", failedChecks: [], warnings: [] }
      : {
          status: "UNVERIFIED_ACCEPTABLE",
          failedChecks: [],
          warnings: [
            "Freshness-sensitive topic: content avoided unqualified current-state claims. No source verified as published today was needed or found.",
          ],
        };
  }

  if (grounding.groundedInTodaySource) {
    // The model made a current-state claim, and this call actually returned
    // a live web_search result verified as published TODAY — trust it.
    return { status: "VERIFIED_CURRENT", failedChecks: [], warnings: [] };
  }

  const searchNote = grounding.groundedInSearch
    ? "a web search was performed, but none of the results could be verified as published today (yesterday or older does not count)"
    : "no live web search backed it up at all";

  return {
    status: "UNVERIFIED_BLOCKED",
    failedChecks: [
      {
        code: "UNGROUNDED_CURRENCY_CLAIM",
        severity: "blocking",
        message: `This topic is freshness-sensitive (prices/versions/regulations/recent events/etc.) and the content states current information as fact (e.g. "currently costs", "the latest version is", "as of today"), but ${searchNote}. Per policy, only information verified as published today may be presented as current — never yesterday's or older information. Either ground the claim in a web_search result confirmed as published today, or rewrite it as general, hedged guidance without a specific current-state assertion.`,
      },
    ],
    warnings: [],
  };
}
