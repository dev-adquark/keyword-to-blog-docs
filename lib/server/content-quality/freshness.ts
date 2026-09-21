import "server-only";
import type { FailedCheck, FreshnessStatus, GenerateRequestV1, SEOPostV1 } from "@/lib/types";

/**
 * Defensive backstop only. Freshness-sensitive requests are routed at the
 * top of the pipeline (see ../generation... and engine.ts's
 * `runContentQualityPipeline`) to the source-pack-first pipeline in
 * ../sources/ + ../generation/rewriter.ts, which is the only place real
 * freshness verification happens (against actual retrieved, dated news
 * sources — see ../sources/sourcePack.ts). This evergreen validator has no
 * access to real source data and therefore can never legitimately pass a
 * freshness-sensitive request — if one somehow reached this path anyway
 * (a routing bug), it fails closed rather than silently letting an
 * unverified "current" claim through.
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

/** Exported so the pipeline can decide, before generation, whether a
 * request must be routed through the source-pack-first pipeline instead of
 * this evergreen one — see engine.ts. */
export function isFreshnessSensitive(request: GenerateRequestV1): boolean {
  const haystack = [request.topic ?? "", ...request.keywords].join(" ").toLowerCase();
  return FRESHNESS_SENSITIVE_TOPIC_SIGNALS.some((signal) => haystack.includes(signal));
}

export function evaluateFreshness(request: GenerateRequestV1, _post: SEOPostV1): FreshnessResult {
  if (!isFreshnessSensitive(request)) {
    return { status: "NOT_APPLICABLE", failedChecks: [], warnings: [] };
  }

  return {
    status: "UNVERIFIED_BLOCKED",
    failedChecks: [
      {
        code: "UNGROUNDED_CURRENCY_CLAIM",
        severity: "blocking",
        message:
          "This topic is freshness-sensitive and requires real, dated source evidence, but reached the evergreen generation path, which has no source-retrieval capability. This request should have been routed through the source-pack-first pipeline (see lib/server/sources/) — this is a fail-closed backstop, not the normal path.",
      },
    ],
    warnings: [],
  };
}
