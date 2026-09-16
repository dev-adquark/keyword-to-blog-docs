import { describe, expect, it } from "vitest";
import { evaluateSeoQuality } from "@/lib/server/content-quality/seoQuality";
import { baseBrief, goodPost } from "./fixtures";

describe("evaluateSeoQuality", () => {
  it("passes a well-formed post", () => {
    const result = evaluateSeoQuality(goodPost(), baseBrief());
    expect(result.failedChecks.filter((f) => f.severity === "blocking")).toHaveLength(0);
  });

  it("rejects a title that is too short", () => {
    const result = evaluateSeoQuality(goodPost({ title: "Pwd" }), baseBrief());
    expect(result.failedChecks.some((f) => f.code === "TITLE_TOO_SHORT")).toBe(true);
  });

  it("flags an unnecessary year in the title when the topic doesn't call for one", () => {
    const result = evaluateSeoQuality(
      goodPost({ title: "Best Password Security Practices: A Guide for 2024" }),
      baseBrief()
    );
    expect(result.failedChecks.some((f) => f.code === "UNNECESSARY_YEAR_IN_TITLE")).toBe(true);
  });

  it("does not flag a year that is part of the actual topic/keyword", () => {
    const result = evaluateSeoQuality(
      goodPost({ title: "2024 Password Breach Report: What Changed" }),
      baseBrief({ topic: "2024 password breach report", primaryKeyword: "2024 password breach report" })
    );
    expect(result.failedChecks.some((f) => f.code === "UNNECESSARY_YEAR_IN_TITLE")).toBe(false);
  });

  it("flags clickbait phrasing", () => {
    const result = evaluateSeoQuality(goodPost({ title: "This One Trick Will Shock You!!" }), baseBrief());
    expect(result.failedChecks.some((f) => f.code === "CLICKBAIT_TITLE")).toBe(true);
  });

  it("rejects an invalid slug format", () => {
    const result = evaluateSeoQuality(goodPost({ slugSuggestion: "Not A Valid Slug!" }), baseBrief());
    expect(result.failedChecks.some((f) => f.code === "INVALID_SLUG_FORMAT")).toBe(true);
  });

  it("flags a doubled separator in an otherwise-valid slug", () => {
    const result = evaluateSeoQuality(goodPost({ slugSuggestion: "how-to--choose" }), baseBrief());
    expect(result.failedChecks.some((f) => f.code === "INVALID_SLUG_FORMAT")).toBe(true);
  });

  it("flags a meta description that is too short", () => {
    const result = evaluateSeoQuality(
      goodPost({ meta: { description: "Short.", primaryKeyword: "strong password" } }),
      baseBrief()
    );
    expect(result.failedChecks.some((f) => f.code === "META_DESCRIPTION_TOO_SHORT")).toBe(true);
  });

  it("flags a generic meta description opener", () => {
    const result = evaluateSeoQuality(
      goodPost({
        meta: {
          description: "This article will discuss everything you need to know about the topic in great detail here.",
          primaryKeyword: "strong password",
        },
      }),
      baseBrief()
    );
    expect(result.failedChecks.some((f) => f.code === "GENERIC_META_DESCRIPTION")).toBe(true);
  });

  it("flags a section with a heading but almost no content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "Empty-ish", contentMarkdown: "Not much here." }],
    });
    const result = evaluateSeoQuality(post, baseBrief());
    expect(result.failedChecks.some((f) => f.code === "EMPTY_SECTION")).toBe(true);
  });

  it("flags weak FAQs: duplicate questions, non-questions, and thin answers", () => {
    const post = goodPost({
      faqs: [
        { question: "Is this secure", answer: "Yes it is very secure indeed for most cases." },
        { question: "Is this secure", answer: "Yes." },
      ],
    });
    const result = evaluateSeoQuality(post, baseBrief());
    const codes = result.failedChecks.filter((f) => f.code === "WEAK_FAQS");
    expect(codes.length).toBeGreaterThan(0);
  });
});
