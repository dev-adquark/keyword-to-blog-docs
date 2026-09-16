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

  it("flags a filler phrase in its contracted form too (\"it's important to note\"), not just \"it is\"", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "One",
          contentMarkdown: "It's important to note that passwords should be long enough to resist attacks.",
        },
        {
          type: "body",
          heading: "Two",
          contentMarkdown: "It's important to note that reuse is dangerous across sites people use daily.",
        },
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "FILLER_CONTENT")).toBe(true);
  });

  it("flags a generic intro opener in its contracted form (\"you're\") and broader landscape phrasing", () => {
    const post = goodPost({
      sections: [
        {
          type: "introduction",
          contentMarkdown:
            "In today's rapidly changing landscape, security matters more than ever. Whether you're a beginner or an expert, this guide helps.",
        },
        ...goodPost().sections.slice(1),
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "GENERIC_INTRO")).toBe(true);
  });

  it("flags formulaic abstract-hedge openers repeated across sections (\"The X is/lies/transforms...\") without needing an exact phrase match", () => {
    const post = goodPost({
      sections: [
        { type: "body", heading: "One", contentMarkdown: "The goal is to help readers choose better passwords overall." },
        { type: "body", heading: "Two", contentMarkdown: "The challenge is remembering many unique passwords at once." },
        { type: "body", heading: "Three", contentMarkdown: "The difference lies in how attackers actually crack passwords." },
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "FORMULAIC_SECTION_OPENERS")).toBe(true);
  });

  it("does not flag a single abstract-style opener on its own — only repeated use across sections", () => {
    const post = goodPost({
      sections: [
        { type: "body", heading: "One", contentMarkdown: "The goal is to help readers choose better passwords overall." },
        ...goodPost().sections.slice(1),
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "FORMULAIC_SECTION_OPENERS")).toBe(false);
  });

  it("flags a generic corporate buzzword repeated more than twice across the document", () => {
    const post = goodPost({
      sections: [
        { type: "body", heading: "One", contentMarkdown: "This tool offers a seamless setup process for new users." },
        { type: "body", heading: "Two", contentMarkdown: "The seamless experience continues throughout account setup." },
        { type: "body", heading: "Three", contentMarkdown: "Every step remains seamless from start to finish here." },
      ],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "OVERUSED_BUZZWORDS")).toBe(true);
  });

  it("does not flag a buzzword used once or twice — only excessive repetition", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "One", contentMarkdown: "This tool offers a seamless setup process." }],
    });
    const result = evaluateWritingQuality(post, "en");
    expect(result.failedChecks.some((f) => f.code === "OVERUSED_BUZZWORDS")).toBe(false);
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
