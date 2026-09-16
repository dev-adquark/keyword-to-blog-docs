import { describe, expect, it } from "vitest";
import { applyDeterministicFixes, MECHANICALLY_FIXABLE_CODES } from "@/lib/server/content-quality/autoFix";
import { baseBrief, goodPost } from "./fixtures";
import type { FailedCheck } from "@/lib/types";

function check(code: string, overrides: Partial<FailedCheck> = {}): FailedCheck {
  return { code, severity: "blocking", message: `${code} problem`, ...overrides };
}

describe("applyDeterministicFixes", () => {
  it("does nothing (and reports no applied fixes) when there is nothing mechanically fixable", () => {
    const result = applyDeterministicFixes(goodPost(), [check("LOW_EXPERT_DEPTH")], baseBrief());
    expect(result.appliedFixes).toHaveLength(0);
    expect(result.post).toEqual(goodPost());
  });

  it("regenerates a valid slug for INVALID_SLUG_FORMAT / SLUG_TOO_LONG", () => {
    const post = goodPost({ slugSuggestion: "Not A Valid Slug!!" });
    const result = applyDeterministicFixes(post, [check("INVALID_SLUG_FORMAT")], baseBrief());
    expect(result.appliedFixes).toContain("INVALID_SLUG_FORMAT");
    expect(result.post.slugSuggestion).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("strips an unnecessary year from the title", () => {
    const post = goodPost({ title: "Best Password Security Practices: A Guide for 2024" });
    const result = applyDeterministicFixes(post, [check("UNNECESSARY_YEAR_IN_TITLE", { severity: "warning" })], baseBrief());
    expect(result.post.title).not.toMatch(/\b(19|20)\d{2}\b/);
    expect(result.post.title.length).toBeGreaterThan(0);
  });

  it("de-shouts and de-clickbaits a title", () => {
    const post = goodPost({ title: "SHOCKING Password Tips You Won't Believe!!!" });
    const result = applyDeterministicFixes(post, [check("CLICKBAIT_TITLE", { severity: "warning" })], baseBrief());
    expect(result.post.title).not.toMatch(/!{2,}/);
    expect(result.post.title).not.toMatch(/\bSHOCKING\b/);
  });

  it("lengthens a too-short title using known topic context, never fabricated info", () => {
    const post = goodPost({ title: "Pwd" });
    const brief = baseBrief({ topic: "strong password", primaryKeyword: "strong password" });
    const result = applyDeterministicFixes(post, [check("TITLE_TOO_SHORT")], brief);
    expect(result.post.title.length).toBeGreaterThan("Pwd".length);
    expect(result.post.title.toLowerCase()).toContain("strong password");
  });

  it("regenerates a meta description from the post's own intro content, not fabricated text", () => {
    const post = goodPost({ meta: { description: "Short.", primaryKeyword: "strong password" } });
    const brief = baseBrief();
    const result = applyDeterministicFixes(post, [check("META_DESCRIPTION_TOO_SHORT", { severity: "warning" })], brief);
    expect(result.post.meta.description.length).toBeGreaterThanOrEqual(50);
    expect(result.post.meta.description.length).toBeLessThanOrEqual(163);
  });

  it("dedupes duplicate section headings", () => {
    const post = goodPost({
      sections: [
        { type: "body", heading: "Same Heading", contentMarkdown: "First section content here." },
        { type: "body", heading: "Same Heading", contentMarkdown: "Second section content here." },
      ],
    });
    const result = applyDeterministicFixes(post, [check("DUPLICATE_HEADING")], baseBrief());
    const headings = result.post.sections.map((s) => s.heading);
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("converts extra introduction-type sections to body and dedupes outline.h2", () => {
    const post = goodPost({
      outline: { h1: "H1", h2: ["Same", "Same"] },
      sections: [
        { type: "introduction", contentMarkdown: "First intro content here for the section." },
        { type: "introduction", contentMarkdown: "Second intro content here for the section." },
      ],
    });
    const result = applyDeterministicFixes(post, [check("STRUCTURE_INVALID")], baseBrief());
    const introCount = result.post.sections.filter((s) => s.type === "introduction").length;
    expect(introCount).toBe(1);
    expect(new Set(result.post.outline.h2).size).toBe(result.post.outline.h2.length);
  });

  it("removes weak FAQ entries (duplicate question, non-question, thin answer) rather than trying to rewrite them", () => {
    const post = goodPost({
      faqs: [
        { question: "Is this secure?", answer: "Yes, using a long random passphrase makes it much harder to crack." },
        { question: "Is this secure?", answer: "Duplicate question, should be dropped." },
        { question: "Not a question", answer: "This should be dropped since it doesn't read as a question at all." },
        { question: "Does it cost money?", answer: "No." },
      ],
    });
    const result = applyDeterministicFixes(post, [check("WEAK_FAQS", { severity: "warning" })], baseBrief());
    expect(result.post.faqs).toHaveLength(1);
    expect(result.post.faqs?.[0]?.question).toBe("Is this secure?");
  });

  it("replaces an H2 heading that is just the exact primary keyword restated", () => {
    const post = goodPost({ outline: { h1: "H1", h2: ["strong password"] } });
    const brief = baseBrief({ primaryKeyword: "strong password", topic: "strong password" });
    const result = applyDeterministicFixes(post, [check("KEYWORD_STUFFED_HEADING", { severity: "warning" })], brief);
    expect(result.post.outline.h2[0]?.toLowerCase()).not.toBe("strong password");
  });

  it("applies every matching fix regardless of severity — cosmetic warnings get fixed too, not just blocking issues", () => {
    const post = goodPost({ slugSuggestion: "Bad Slug!!" });
    const result = applyDeterministicFixes(post, [check("INVALID_SLUG_FORMAT", { severity: "warning" })], baseBrief());
    expect(result.appliedFixes).toContain("INVALID_SLUG_FORMAT");
  });

  it("MECHANICALLY_FIXABLE_CODES matches exactly the codes this module knows how to fix", () => {
    expect(MECHANICALLY_FIXABLE_CODES.has("INVALID_SLUG_FORMAT")).toBe(true);
    expect(MECHANICALLY_FIXABLE_CODES.has("LOW_EXPERT_DEPTH")).toBe(false);
    expect(MECHANICALLY_FIXABLE_CODES.has("KEYWORD_STUFFING")).toBe(false); // body-density stuffing needs real rewriting
  });
});
