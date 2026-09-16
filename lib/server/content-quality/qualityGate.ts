import "server-only";
import type { ContentQualityReport, QualityGateStatus } from "@/lib/types";
import { QUALITY_THRESHOLDS } from "./config";

/**
 * The single authoritative decision point. Mandatory (blocking) failures
 * always prevent a PASS regardless of score; scores below threshold also
 * block even with zero blocking failedChecks (e.g. borderline-weak writing
 * that didn't trip any single hard rule but is collectively poor).
 */
export function decideQualityGate(
  report: Omit<ContentQualityReport, "overallStatus">,
  revisionsRemaining: boolean
): QualityGateStatus {
  const hasBlockingFailure = report.failedChecks.some((f) => f.severity === "blocking");

  const meetsThresholds =
    report.overallScore >= QUALITY_THRESHOLDS.overall &&
    report.writingScore >= QUALITY_THRESHOLDS.writing &&
    report.originalityScore >= QUALITY_THRESHOLDS.originality &&
    report.depthScore >= QUALITY_THRESHOLDS.depth &&
    report.seoScore >= QUALITY_THRESHOLDS.seo &&
    report.readabilityScore >= QUALITY_THRESHOLDS.readability &&
    report.keywordScore >= QUALITY_THRESHOLDS.keyword &&
    report.structureScore >= QUALITY_THRESHOLDS.structure;

  if (!hasBlockingFailure && meetsThresholds) return "PASS";
  return revisionsRemaining ? "REVISION_REQUIRED" : "FAIL";
}
