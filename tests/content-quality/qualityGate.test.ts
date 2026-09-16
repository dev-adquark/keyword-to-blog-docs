import { describe, expect, it } from "vitest";
import { decideQualityGate } from "@/lib/server/content-quality/qualityGate";
import type { ContentQualityReport } from "@/lib/types";

function report(overrides: Partial<Omit<ContentQualityReport, "overallStatus">> = {}): Omit<ContentQualityReport, "overallStatus"> {
  return {
    qualityVersion: "1.0.0",
    overallScore: 90,
    writingScore: 90,
    originalityScore: 90,
    depthScore: 90,
    seoScore: 90,
    readabilityScore: 90,
    keywordScore: 90,
    structureScore: 90,
    factualityStatus: "STANDARD_UNVERIFIED",
    freshnessStatus: "NOT_APPLICABLE",
    wordCount: 800,
    keywordCoverage: 1,
    revisionCount: 0,
    passedChecks: [],
    failedChecks: [],
    warnings: [],
    revisionReasons: [],
    llmEvaluatorAvailable: true,
    ...overrides,
  };
}

describe("decideQualityGate", () => {
  it("passes when there are no blocking failures and every score clears its threshold", () => {
    expect(decideQualityGate(report(), true)).toBe("PASS");
  });

  it("requires revision when a blocking failure exists and revisions remain", () => {
    const withFailure = report({
      failedChecks: [{ code: "KEYWORD_STUFFING", severity: "blocking", message: "x" }],
    });
    expect(decideQualityGate(withFailure, true)).toBe("REVISION_REQUIRED");
  });

  it("fails outright when a blocking failure exists and no revisions remain", () => {
    const withFailure = report({
      failedChecks: [{ code: "KEYWORD_STUFFING", severity: "blocking", message: "x" }],
    });
    expect(decideQualityGate(withFailure, false)).toBe("FAIL");
  });

  it("a warning-only report (no blocking failures) still passes even with revisions remaining", () => {
    const warningOnly = report({
      failedChecks: [{ code: "SENTENCES_TOO_LONG", severity: "warning", message: "x" }],
    });
    expect(decideQualityGate(warningOnly, true)).toBe("PASS");
  });

  it("fails a collectively-weak report even with zero individual blocking failedChecks", () => {
    const belowThreshold = report({ overallScore: 40, writingScore: 40 });
    expect(decideQualityGate(belowThreshold, false)).toBe("FAIL");
  });

  it("requests revision for a below-threshold report while revisions remain", () => {
    const belowThreshold = report({ overallScore: 40, writingScore: 40 });
    expect(decideQualityGate(belowThreshold, true)).toBe("REVISION_REQUIRED");
  });
});
