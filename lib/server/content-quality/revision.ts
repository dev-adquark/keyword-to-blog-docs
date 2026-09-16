import "server-only";
import type { ContentQualityReport, RevisionFeedback } from "@/lib/types";

/**
 * Turns the failed checks from one validation pass into a targeted revision
 * request — never a blind "regenerate the whole thing" instruction. Only
 * blocking failures drive revision; warnings are informational only, since
 * revising for every warning would make the loop churn indefinitely.
 */
export function buildRevisionFeedback(report: Omit<ContentQualityReport, "overallStatus">): RevisionFeedback {
  const blocking = report.failedChecks.filter((f) => f.severity === "blocking");

  const grouped = blocking.map((f) => `- [${f.code}]${f.section ? ` (section: "${f.section}")` : ""} ${f.message}`);

  const instructions = [
    ...grouped,
    "",
    "Fix exactly these problems. Do not change sections that were not flagged. Do not shorten the article to avoid the problems — address them directly.",
  ].join("\n");

  return { failedChecks: blocking, instructions };
}
