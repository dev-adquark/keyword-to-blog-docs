import { describe, expect, it } from "vitest";
import { buildRevisionFeedback } from "@/lib/server/content-quality/revision";
import type { ContentQualityReport } from "@/lib/types";

function report(failedChecks: ContentQualityReport["failedChecks"]): Omit<ContentQualityReport, "overallStatus"> {
  return {
    qualityVersion: "1.0.0",
    overallScore: 50,
    writingScore: 50,
    originalityScore: 50,
    depthScore: 50,
    seoScore: 50,
    readabilityScore: 50,
    keywordScore: 50,
    structureScore: 50,
    factualityStatus: "STANDARD_UNVERIFIED",
    freshnessStatus: "NOT_APPLICABLE",
    wordCount: 500,
    keywordCoverage: 0.5,
    revisionCount: 0,
    passedChecks: [],
    failedChecks,
    warnings: [],
    revisionReasons: [],
    llmEvaluatorAvailable: false,
  };
}

describe("buildRevisionFeedback", () => {
  it("includes only blocking failures in the targeted revision instructions, never warnings", () => {
    const feedback = buildRevisionFeedback(
      report([
        { code: "GENERIC_INTRO", severity: "blocking", message: "The intro is generic." },
        { code: "SENTENCES_TOO_LONG", severity: "warning", message: "Some sentences are long." },
      ])
    );
    expect(feedback.failedChecks).toHaveLength(1);
    expect(feedback.failedChecks[0]?.code).toBe("GENERIC_INTRO");
    expect(feedback.instructions).toContain("GENERIC_INTRO");
    expect(feedback.instructions).not.toContain("SENTENCES_TOO_LONG");
  });

  it("includes the section reference when a failed check names one", () => {
    const feedback = buildRevisionFeedback(
      report([{ code: "LOW_EXPERT_DEPTH", severity: "blocking", message: "Too shallow.", section: "Password Length" }])
    );
    expect(feedback.instructions).toContain("Password Length");
  });

  it("instructs the model to preserve unflagged content rather than regenerate from scratch", () => {
    const feedback = buildRevisionFeedback(
      report([{ code: "KEYWORD_STUFFING", severity: "blocking", message: "Too dense." }])
    );
    expect(feedback.instructions.toLowerCase()).toContain("not");
    expect(feedback.instructions).toMatch(/do not change sections that were not flagged/i);
  });
});
