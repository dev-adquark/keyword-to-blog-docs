import "server-only";
import type { FactualityStatus, FailedCheck, GenerateRequestV1 } from "@/lib/types";

/**
 * Honest factuality policy.
 *
 * STANDARD mode (default), evergreen pipeline: content comes from model
 * knowledge. We say so, plainly, and never claim external facts were
 * checked.
 *
 * "verified" mode, evergreen pipeline: the request explicitly requires
 * source-backed verification, but the evergreen generate/repair pipeline
 * (lib/server/content-quality/engine.ts) has no source-retrieval
 * capability of its own. Rather than pretend, it fails the quality gate
 * honestly instead of fabricating verification, sources, or citations.
 *
 * `sourceGrounded: true` — passed only by the source-pack-first pipeline
 * (lib/server/content-quality/sourceGroundedPipeline.ts) — means real
 * source-backed verification genuinely just happened for this request (see
 * lib/server/sources/), so it is honestly reported as VERIFIED and never
 * blocked, regardless of which factualityMode was requested.
 */
export interface FactualityResult {
  status: FactualityStatus;
  failedChecks: FailedCheck[];
  warnings: string[];
}

export function evaluateFactuality(request: GenerateRequestV1, sourceGrounded = false): FactualityResult {
  if (sourceGrounded) {
    return { status: "VERIFIED", failedChecks: [], warnings: [] };
  }

  const mode = request.factualityMode ?? "standard";

  if (mode === "standard") {
    return {
      status: "STANDARD_UNVERIFIED",
      failedChecks: [],
      warnings: [
        "Content is generated from the model's own knowledge and has not been independently fact-checked against external sources.",
      ],
    };
  }

  // mode === "verified", not source-grounded (i.e. the request wasn't
  // freshness-sensitive, so it never reached the source-pack pipeline):
  // honestly unavailable via this path.
  return {
    status: "VERIFICATION_UNAVAILABLE",
    failedChecks: [
      {
        code: "FACTUALITY_UNVERIFIED",
        severity: "blocking",
        message:
          "factualityMode: 'verified' was requested, but this request did not go through the source-retrieval pipeline (see lib/server/sources/), so its factual claims were not actually verified. Rather than fabricate verification, the request cannot be fulfilled in verified mode this way.",
      },
    ],
    warnings: [],
  };
}
