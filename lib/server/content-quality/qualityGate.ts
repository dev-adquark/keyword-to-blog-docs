import "server-only";
import type { ContentQualityReport, QualityGateStatus } from "@/lib/types";

/**
 * The single authoritative decision point.
 *
 * BUG FIX: this used to ALSO require every individual category score
 * (writing/originality/depth/seo/readability/keyword/structure) to
 * independently clear its own numeric threshold, on top of "no blocking
 * failedChecks". That produced exactly the reported bug — a report with
 * overallScore: 90 and failedCheckCodes: [] (i.e. zero identified, fixable
 * problems) could still fail if some single category's score dipped below
 * its own threshold from accumulated non-blocking *warnings* alone. Since
 * warnings are explicitly non-critical/cosmetic by definition (every
 * validator already classifies severity itself), and there was no
 * corresponding failedCheck to even act on, that failure was never
 * fixable — it was just an incoherent, disconnected second gate rejecting
 * content that had no actual identified problem.
 *
 * The fix: a blocking failedCheck is the only thing that can fail the gate.
 * Every validator already assigns "blocking" to genuine, actionable quality
 * problems and "warning" to cosmetic ones — that classification IS the
 * quality bar. Scores remain in the report for observability, but are no
 * longer re-checked against a second, independent numeric threshold.
 */
export function decideQualityGate(report: Omit<ContentQualityReport, "overallStatus">): QualityGateStatus {
  const hasBlockingFailure = report.failedChecks.some((f) => f.severity === "blocking");
  return hasBlockingFailure ? "FAIL" : "PASS";
}
