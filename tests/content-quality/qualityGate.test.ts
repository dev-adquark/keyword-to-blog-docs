import { describe, expect, it } from "vitest";
import { decideQualityGate } from "@/lib/server/content-quality/qualityGate";
import type { ContentQualityReport } from "@/lib/types";

function report(overrides: Partial<Omit<ContentQualityReport, "overallStatus">> = {}): Omit<ContentQualityReport, "overallStatus"> {
  return {
    qualityVersion: "2.0.0",
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
    ...overrides,
  };
}

describe("decideQualityGate", () => {
  it("REGRESSION: overallScore 90, zero failedChecks, revisionCount 2 must PASS, not FAIL", () => {
    // Exact bug report: a genuinely valid result (no identified, actionable
    // problem) was being rejected because a since-removed second gate
    // required every individual category score to independently clear its
    // own threshold, disconnected from any actual failedCheck.
    const buggyInput = report({ overallScore: 90, failedChecks: [], revisionCount: 2 });
    expect(decideQualityGate(buggyInput)).toBe("PASS");
  });

  it("passes when there are no blocking failedChecks", () => {
    expect(decideQualityGate(report())).toBe("PASS");
  });

  it("fails when a blocking failedCheck is present", () => {
    const withFailure = report({
      failedChecks: [{ code: "KEYWORD_STUFFING", severity: "blocking", message: "x" }],
    });
    expect(decideQualityGate(withFailure)).toBe("FAIL");
  });

  it("a warning-only report still passes, even with a low overall score", () => {
    const warningOnly = report({
      overallScore: 40,
      writingScore: 40,
      failedChecks: [{ code: "SENTENCES_TOO_LONG", severity: "warning", message: "x" }],
    });
    expect(decideQualityGate(warningOnly)).toBe("PASS");
  });

  it("a collectively low overall/category score with zero blocking failedChecks still passes — cosmetic imperfections never fail the gate on their own", () => {
    const lowButNoBlockingIssues = report({ overallScore: 35, writingScore: 20, structureScore: 25, failedChecks: [] });
    expect(decideQualityGate(lowButNoBlockingIssues)).toBe("PASS");
  });

  it("multiple blocking failures still fail regardless of score", () => {
    const manyFailures = report({
      overallScore: 95,
      failedChecks: [
        { code: "LOW_EXPERT_DEPTH", severity: "blocking", message: "a" },
        { code: "KEYWORD_STUFFING", severity: "blocking", message: "b" },
      ],
    });
    expect(decideQualityGate(manyFailures)).toBe("FAIL");
  });
});
