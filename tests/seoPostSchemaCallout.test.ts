import { describe, expect, it } from "vitest";
import { seoPostSchema } from "@/lib/server/validation";

function basePost(sections: unknown[]) {
  return {
    title: "t",
    slugSuggestion: "t",
    meta: { description: "d", primaryKeyword: "kw" },
    outline: { h1: "H1", h2: ["a"] },
    sections,
    conclusion: "the end",
  };
}

describe("seoPostSchema — callout-only sections", () => {
  it("accepts a pure callout section with no contentMarkdown (real Claude output shape)", () => {
    const post = basePost([
      { type: "body", contentMarkdown: "Some real prose." },
      { type: "callout", callout: { label: "Pro Tip", text: "Do the thing." } },
    ]);
    const result = seoPostSchema.safeParse(post);
    expect(result.success).toBe(true);
  });

  it("still rejects a section with neither contentMarkdown nor callout", () => {
    const post = basePost([{ type: "body" }]);
    const result = seoPostSchema.safeParse(post);
    expect(result.success).toBe(false);
  });

  it("still rejects a non-callout section with an empty contentMarkdown", () => {
    const post = basePost([{ type: "body", contentMarkdown: "" }]);
    const result = seoPostSchema.safeParse(post);
    expect(result.success).toBe(false);
  });

  it("still requires real prose for introduction/body/faq/conclusion sections", () => {
    const post = basePost([{ type: "introduction", contentMarkdown: "Real intro text." }]);
    expect(seoPostSchema.safeParse(post).success).toBe(true);
  });
});
