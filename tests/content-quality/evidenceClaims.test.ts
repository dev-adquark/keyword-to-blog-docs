import { describe, expect, it } from "vitest";
import { evaluateEvidenceClaims } from "@/lib/server/content-quality/evidenceClaims";
import { baseRequest, goodPost } from "./fixtures";

describe("evaluateEvidenceClaims", () => {
  it("passes a genuinely honest, unembellished post", () => {
    const result = evaluateEvidenceClaims(baseRequest(), goodPost());
    expect(result.failedChecks).toHaveLength(0);
  });

  it("REGRESSION: catches the exact reported bad example — a precise, unsourced behavioral claim", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "Daily Habits",
          contentMarkdown:
            "Professionals who allocate 15-20 focused minutes daily to a single task consistently outpace those who multitask throughout the day.",
        },
      ],
    });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    expect(result.failedChecks.some((f) => f.code === "UNSUPPORTED_EVIDENCE_CLAIM")).toBe(true);
  });

  it("flags an unsourced 'studies show' style claim", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "Evidence",
          contentMarkdown: "Studies show that longer passwords are harder to crack than complex short ones.",
        },
      ],
    });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    expect(result.failedChecks.some((f) => f.code === "UNSUPPORTED_EVIDENCE_CLAIM")).toBe(true);
  });

  it("flags a fabricated-sounding percentage statistic about people", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "Stats",
          contentMarkdown: "78% of professionals report better focus after adopting this single habit consistently.",
        },
      ],
    });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    expect(result.failedChecks.some((f) => f.code === "UNSUPPORTED_EVIDENCE_CLAIM")).toBe(true);
  });

  it("flags 'proven strategies' and 'experts agree' as unsourced authority claims", () => {
    const post = goodPost({
      sections: [
        { type: "body", heading: "One", contentMarkdown: "These are proven strategies for building strong passwords." },
        { type: "body", heading: "Two", contentMarkdown: "Experts agree that password length matters more than symbols." },
      ],
    });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    const codes = result.failedChecks.filter((f) => f.code === "UNSUPPORTED_EVIDENCE_CLAIM");
    expect(codes.length).toBeGreaterThanOrEqual(2);
  });

  it("does not flag a hedged, honest general observation", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "General guidance",
          contentMarkdown: "A short, scheduled reading session can make news consumption easier to manage than checking feeds throughout the day.",
        },
      ],
    });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    expect(result.failedChecks).toHaveLength(0);
  });

  it("also checks the conclusion for restated unsupported claims", () => {
    const post = goodPost({ conclusion: "Research shows this approach works better than any alternative available." });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    expect(result.failedChecks.some((f) => f.section === "conclusion")).toBe(true);
  });

  it("skips evidence-claim checks entirely for non-English content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "One", contentMarkdown: "Studies show that longer passwords are harder to crack." }],
    });
    const result = evaluateEvidenceClaims(baseRequest({ language: "es" }), post);
    expect(result.failedChecks).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("English-only"))).toBe(true);
  });

  it("never claims a percentage/AI-detection score itself — only reports concrete, explainable matches", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "One", contentMarkdown: "Studies show this works." }],
    });
    const result = evaluateEvidenceClaims(baseRequest(), post);
    const allText = result.failedChecks.map((f) => f.message).join(" ");
    expect(allText).not.toMatch(/AI[- ]?(probability|detected|undetectable)/i);
  });

  it("REGRESSION: does NOT block a statistic that genuinely traces back to the real, retrieved source-pack evidence — this is exactly how legitimate news content is phrased", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "Market reaction",
          contentMarkdown: "A recent survey found that 34% of professionals expect a rate cut before year-end.",
        },
      ],
    });
    const groundingEvidenceText =
      "According to the survey published this week, 34% of professionals said they expect the central bank to cut rates before the end of the year.";
    const result = evaluateEvidenceClaims(baseRequest(), post, groundingEvidenceText);
    expect(result.failedChecks).toHaveLength(0);
  });

  it("still blocks a statistic that does NOT appear anywhere in the source-pack evidence, even when grounding text is supplied", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "Market reaction",
          contentMarkdown: "A recent survey found that 91% of professionals expect a rate cut before year-end.",
        },
      ],
    });
    const groundingEvidenceText = "The central bank held rates steady this week, surprising some analysts.";
    const result = evaluateEvidenceClaims(baseRequest(), post, groundingEvidenceText);
    expect(result.failedChecks.some((f) => f.code === "UNSUPPORTED_EVIDENCE_CLAIM")).toBe(true);
  });
});
