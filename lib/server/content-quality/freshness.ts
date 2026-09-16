import "server-only";
import type { FailedCheck, FreshnessStatus, GenerateRequestV1, SEOPostV1 } from "@/lib/types";
import { collectSectionProse } from "./textStats";

/**
 * Detects freshness-sensitive topics (current prices, versions, laws,
 * "latest" anything) and checks whether the generated text makes unqualified
 * current-state claims it can't actually back up. Never invents "the latest"
 * information; at most it asks for hedged language, or — when the request
 * also demands verification — fails honestly.
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
];

const UNQUALIFIED_CURRENT_CLAIM_PATTERNS = [
  /\bthe latest version is\b/i,
  /\bcurrently costs?\b/i,
  /\bas of (?:today|now|writing)\b/i,
  /\bthe current (?:price|version|law|policy) is\b/i,
];

function isFreshnessSensitive(request: GenerateRequestV1): boolean {
  const haystack = [request.topic ?? "", ...request.keywords].join(" ").toLowerCase();
  return FRESHNESS_SENSITIVE_TOPIC_SIGNALS.some((signal) => haystack.includes(signal));
}

export function evaluateFreshness(request: GenerateRequestV1, post: SEOPostV1): FreshnessResult {
  if (!isFreshnessSensitive(request)) {
    return { status: "NOT_APPLICABLE", failedChecks: [], warnings: [] };
  }

  const allText = [post.title, ...collectSectionProse(post.sections), post.conclusion].join(" ");
  const unqualifiedClaims = UNQUALIFIED_CURRENT_CLAIM_PATTERNS.filter((p) => p.test(allText));

  const verificationRequired = request.factualityMode === "verified";

  if (unqualifiedClaims.length === 0) {
    return { status: "UNVERIFIED_ACCEPTABLE", failedChecks: [], warnings: [] };
  }

  if (verificationRequired) {
    return {
      status: "UNVERIFIED_BLOCKED",
      failedChecks: [
        {
          code: "FRESHNESS_UNVERIFIED",
          severity: "blocking",
          message:
            "This topic is freshness-sensitive (prices/versions/regulations/etc.) and the content states current information as fact, but factualityMode: 'verified' was requested and no live verification is available.",
        },
      ],
      warnings: [],
    };
  }

  return {
    status: "UNVERIFIED_ACCEPTABLE",
    failedChecks: [
      {
        code: "FRESHNESS_UNVERIFIED",
        severity: "warning",
        message:
          "This topic is freshness-sensitive and the content states current information (e.g. \"currently costs\", \"the latest version is\") without hedging — it should be phrased as general guidance rather than an as-of-now fact.",
      },
    ],
    warnings: [
      "Freshness-sensitive topic: content reflects the model's training data, not verified current information.",
    ],
  };
}
