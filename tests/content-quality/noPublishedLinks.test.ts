import { describe, expect, it } from "vitest";
import { evaluateNoPublishedLinks } from "@/lib/server/content-quality/noPublishedLinks";
import { goodPost } from "./fixtures";

describe("evaluateNoPublishedLinks", () => {
  it("passes a genuinely clean post with no links/citations at all", () => {
    const result = evaluateNoPublishedLinks(goodPost());
    expect(result.failedChecks).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("blocks a raw URL in body content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "Section", contentMarkdown: "Read more at https://example.com/article for the full story." }],
    });
    const result = evaluateNoPublishedLinks(post);
    expect(result.failedChecks.some((f) => f.code === "SOURCE_LINK_IN_CONTENT")).toBe(true);
  });

  it("blocks a markdown link in body content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "Section", contentMarkdown: "According to [the report](https://example.com/report), sales rose." }],
    });
    const result = evaluateNoPublishedLinks(post);
    expect(result.failedChecks.some((f) => f.code === "SOURCE_LINK_IN_CONTENT")).toBe(true);
  });

  it("blocks an HTML anchor tag in body content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "Section", contentMarkdown: 'See <a href="https://example.com">this article</a> for more.' }],
    });
    const result = evaluateNoPublishedLinks(post);
    expect(result.failedChecks.some((f) => f.code === "SOURCE_LINK_IN_CONTENT")).toBe(true);
  });

  it("blocks a URL in the title, meta description, or conclusion", () => {
    expect(evaluateNoPublishedLinks(goodPost({ title: "Report https://example.com/x shows growth" })).failedChecks).not.toHaveLength(0);
    expect(
      evaluateNoPublishedLinks(goodPost({ meta: { description: "See https://example.com/x", primaryKeyword: "kw" } })).failedChecks
    ).not.toHaveLength(0);
    expect(evaluateNoPublishedLinks(goodPost({ conclusion: "In summary, see https://example.com/x." })).failedChecks).not.toHaveLength(0);
  });

  it("blocks a URL in an FAQ answer", () => {
    const post = goodPost({ faqs: [{ question: "Why?", answer: "See https://example.com/answer for details." }] });
    const result = evaluateNoPublishedLinks(post);
    expect(result.failedChecks.some((f) => f.code === "SOURCE_LINK_IN_CONTENT")).toBe(true);
  });

  it('blocks a "Sources" or "References" section heading, even with no literal link in it', () => {
    const post = goodPost({
      sections: [
        ...goodPost().sections,
        { type: "body", heading: "Sources", contentMarkdown: "Article one and article two." },
      ],
    });
    const result = evaluateNoPublishedLinks(post);
    expect(result.failedChecks.some((f) => f.code === "SOURCE_LINK_IN_CONTENT" && /Sources/.test(f.message))).toBe(true);
  });

  it("never checks post.sources itself — that's internal citation-tracking metadata, not published content", () => {
    const post = goodPost({
      sources: [{ title: "Real source", url: "https://example.com/real-and-legitimate-source", publishedAt: null }],
    });
    const result = evaluateNoPublishedLinks(post);
    expect(result.failedChecks).toHaveLength(0);
  });
});
