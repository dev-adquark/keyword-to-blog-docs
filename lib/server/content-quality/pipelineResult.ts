import "server-only";
import type { ContentQualityReport, SEOPostV1 } from "@/lib/types";
import { ApiError } from "../apiErrors";

/**
 * Shared between engine.ts (evergreen pipeline) and
 * sourceGroundedPipeline.ts (freshness-sensitive pipeline) — living here
 * rather than in engine.ts avoids a circular import, since
 * sourceGroundedPipeline.ts is invoked FROM engine.ts.
 */

export interface QualityPipelineResult {
  post: SEOPostV1;
  report: ContentQualityReport;
}

/**
 * Carries the FULL internal report (for DB persistence / logging) alongside
 * a deliberately minimal public `details` payload — the public API response
 * only ever sees stable, machine-readable failedCheck codes, never full
 * internal scores/messages (see "do not expose internal scoring
 * implementation unnecessarily").
 */
export class ContentQualityFailedError extends ApiError {
  report: ContentQualityReport;

  constructor(report: ContentQualityReport) {
    super(
      "CONTENT_QUALITY_FAILED",
      "Generated content did not meet the required quality standard after automatic correction.",
      {
        revisionCount: report.revisionCount,
        overallScore: report.overallScore,
        failedCheckCodes: [...new Set(report.failedChecks.filter((f) => f.severity === "blocking").map((f) => f.code))],
      }
    );
    this.report = report;
  }
}
