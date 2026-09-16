import { describe, expect, it } from "vitest";
import { evaluateWritingQuality } from "@/lib/server/content-quality/writingQuality";
import { goodPost } from "./fixtures";

describe("evaluateWritingQuality", () => {
  it("passes a genuinely well-written post with no generic patterns", () => {
    const result = evaluateWritingQuality(goodPost(), "en");
    expect(result.failedChecks.filter((f) => f.severity === "blocking")).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("flags a generic introduction opener", () => {
    const post = goodPost({
      sections: [
        {
          type: "introduction",
          contentMarkdown:
            "In today's digital landscape, security matters more than ever. Whether you are a casual user or a business owner, passwords are important.",
        },
        ...goodPost().sections.slice(1),
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "GENERIC_INTRO")).toBe(true);
  });

  it("flags a generic conclusion", () => {
    const post = goodPost({
      conclusion: "In conclusion, by following these tips you will have a strong password.",
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "GENERIC_CONCLUSION")).toBe(true);
  });

  it("flags the same sentence repeated three or more times as REPETITIVE_SENTENCES", () => {
    const repeated = "This is a fact you must remember about strong passwords.";
    const post = goodPost({
      sections: [
        { type: "body", heading: "One", contentMarkdown: `${repeated} It has more context after it here.` },
        { type: "body", heading: "Two", contentMarkdown: `${repeated} And some more unrelated context follows.` },
        { type: "body", heading: "Three", contentMarkdown: `${repeated} Yet another sentence trails behind it.` },
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "REPETITIVE_SENTENCES")).toBe(true);
  });

  it("flags filler phrases when they appear repeatedly", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "One",
          contentMarkdown:
            "It is important to note that passwords should be long. Needless to say, length matters more than symbols for real-world security.",
        },
        {
          type: "body",
          heading: "Two",
          contentMarkdown:
            "It is important to note that reuse is dangerous across sites and services people use every day.",
        },
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "FILLER_CONTENT")).toBe(true);
  });

  it("skips all English-specific pattern checks for a non-English language", () => {
    const post = goodPost({
      conclusion: "In conclusion, by following these tips you will have a strong password.",
    });
    const result = evaluateWritingQuality(post, "es");
    expect(result.failedChecks).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("English-only"))).toBe(true);
    expect(result.score).toBe(100);
  });
});
