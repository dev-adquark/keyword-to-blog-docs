import "server-only";
import type { FactualityStatus, FailedCheck, GenerateRequestV1 } from "@/lib/types";

/**
 * Honest factuality policy — this deployment has no source-retrieval/web
 * search capability, so it never claims to have verified anything.
 *
 * STANDARD mode (default): content comes from model knowledge. We say so,
 * plainly, and never claim external facts were checked.
 *
 * "verified" mode: the request explicitly requires source-backed
 * verification. Since we cannot actually do that here, we do NOT pretend to
 * — we fail the quality gate honestly rather than fabricate verification,
 * sources, or citations.
 */
export interface FactualityResult {
  status: FactualityStatus;
  failedChecks: FailedCheck[];
  warnings: string[];
}

export function evaluateFactuality(request: GenerateRequestV1): FactualityResult {
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

  // mode === "verified": honestly unavailable in this deployment.
  return {
    status: "VERIFICATION_UNAVAILABLE",
    failedChecks: [
      {
        code: "FACTUALITY_UNVERIFIED",
        severity: "blocking",
        message:
          "factualityMode: 'verified' was requested, but this deployment has no source-retrieval capability to verify factual claims. Rather than fabricate verification, the request cannot be fulfilled in verified mode.",
      },
    ],
    warnings: [],
  };
}
