import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  renderHtml,
  countWords,
  enforceSectionConstraint,
  assertWordCountWithinTolerance,
} from "@/lib/server/postRender";
import type { SEOPostV1 } from "@/lib/types";

function makePost(overrides: Partial<SEOPostV1> = {}): SEOPostV1 {
  return {
    title: "Title",
    slugSuggestion: "title",
    meta: { description: "desc", primaryKeyword: "kw" },
    outline: { h1: "Main Heading", h2: ["A", "B"] },
    sections: [
      { type: "introduction", contentMarkdown: "Intro text here." },
      { type: "body", heading: "Body heading", contentMarkdown: "Body text with several words in it." },
    ],
    conclusion: "The conclusion.",
    ...overrides,
  };
}

describe("countWords", () => {
  it("counts words across all sections", () => {
    const post = makePost();
    // "Intro text here." (3) + "Body text with several words in it." (7)
    expect(countWords(post)).toBe(10);
  });
});

describe("enforceSectionConstraint", () => {
  it("truncates sections beyond maxSections deterministically, no AI call needed", () => {
    const post = makePost({
      sections: [
        { type: "introduction", contentMarkdown: "one" },
        { type: "body", contentMarkdown: "two" },
        { type: "body", contentMarkdown: "three" },
      ],
    });
    const result = enforceSectionConstraint(post, { maxWords: 1000, maxSections: 2 });
    expect(result.sections).toHaveLength(2);
    expect(result.sections[0]!.contentMarkdown).toBe("one");
    expect(result.sections[1]!.contentMarkdown).toBe("two");
  });

  it("leaves sections untouched when within the limit", () => {
    const post = makePost();
    const result = enforceSectionConstraint(post, { maxWords: 1000, maxSections: 5 });
    expect(result.sections).toHaveLength(2);
  });

  it("leaves sections untouched when maxSections is unset", () => {
    const post = makePost();
    const result = enforceSectionConstraint(post, { maxWords: 1000 });
    expect(result.sections).toHaveLength(2);
  });
});

describe("assertWordCountWithinTolerance", () => {
  it("does not throw for a reasonable word count", () => {
    expect(() => assertWordCountWithinTolerance(1000, { maxWords: 1000 })).not.toThrow();
    expect(() => assertWordCountWithinTolerance(1400, { maxWords: 1000 })).not.toThrow(); // 40% over, within tolerance
  });

  it("throws when egregiously (50%+) over maxWords, rather than silently returning it", () => {
    expect(() => assertWordCountWithinTolerance(1600, { maxWords: 1000 })).toThrow();
  });

  it("throws when egregiously under minWords", () => {
    expect(() => assertWordCountWithinTolerance(20, { maxWords: 1000, minWords: 100 })).toThrow();
  });

  it("does not throw when minWords is unset", () => {
    expect(() => assertWordCountWithinTolerance(1, { maxWords: 1000 })).not.toThrow();
  });
});

describe("duplicate conclusion bug", () => {
  it("renderMarkdown never renders a conclusion-type section's own content — post.conclusion is the sole canonical closer", () => {
    const post = makePost({
      sections: [
        { type: "body", heading: "Body", contentMarkdown: "Body content here." },
        { type: "conclusion", heading: "Wrapping Up", contentMarkdown: "This is the section's own closing text." },
      ],
      conclusion: "This is the canonical conclusion field.",
    });
    const md = renderMarkdown(post);

    expect(md).toContain("This is the canonical conclusion field.");
    expect(md).not.toContain("This is the section's own closing text.");
    expect(md).not.toContain("Wrapping Up");
    // Appears exactly once, not duplicated.
    const occurrences = md.split("This is the canonical conclusion field.").length - 1;
    expect(occurrences).toBe(1);
  });

  it("renderHtml never renders a conclusion-type section's own content either", () => {
    const post = makePost({
      sections: [
        { type: "conclusion", heading: "Wrapping Up", contentMarkdown: "Section-level closing text." },
      ],
      conclusion: "Canonical conclusion text.",
    });
    const html = renderHtml(post);

    expect(html).toContain("Canonical conclusion text.");
    expect(html).not.toContain("Section-level closing text.");
    expect(html).not.toContain("Wrapping Up");
    expect(html.split("Canonical conclusion text.").length - 1).toBe(1);
  });

  it("still renders the conclusion exactly once when there is no separate conclusion-type section at all", () => {
    const post = makePost({ conclusion: "Only conclusion source." });
    const md = renderMarkdown(post);
    expect(md.split("Only conclusion source.").length - 1).toBe(1);
  });
});

describe("renderMarkdown", () => {
  it("includes h1, section headings, callouts, faqs, and conclusion", () => {
    const post = makePost({
      sections: [
        {
          type: "body",
          heading: "Section",
          contentMarkdown: "Body.",
          callout: { label: "Tip", text: "A tip." },
        },
      ],
      faqs: [{ question: "Q1?", answer: "A1." }],
    });
    const md = renderMarkdown(post);
    expect(md).toContain("# Main Heading");
    expect(md).toContain("## Section");
    expect(md).toContain("Body.");
    expect(md).toContain("Tip");
    expect(md).toContain("A tip.");
    expect(md).toContain("Frequently asked questions");
    expect(md).toContain("Q1?");
    expect(md).toContain("A1.");
    expect(md).toContain("The conclusion.");
  });

  it("renders a Sources section when the post has source attribution (freshness-sensitive content)", () => {
    const post = makePost({
      sources: [
        { title: "Company X launches new product", url: "https://example.com/story", publishedAt: "2026-09-21T10:00:00.000Z" },
      ],
    });
    const md = renderMarkdown(post);
    expect(md).toContain("## Sources");
    expect(md).toContain("[Company X launches new product](https://example.com/story)");
  });

  it("omits the Sources section entirely for evergreen content with no sources", () => {
    const md = renderMarkdown(makePost());
    expect(md).not.toContain("## Sources");
  });
});

describe("renderHtml", () => {
  it("produces real HTML structure — h1/h2/p tags, not markdown pretending to be HTML", () => {
    const post = makePost();
    const html = renderHtml(post);
    expect(html).toContain("<h1>Main Heading</h1>");
    expect(html).toContain("<h2>Body heading</h2>");
    expect(html).toMatch(/<p>.*Intro text here\..*<\/p>/);
  });

  it("renders and escapes a Sources section when present", () => {
    const post = makePost({
      sources: [{ title: "Company X <update>", url: "https://example.com/story", publishedAt: null }],
    });
    const html = renderHtml(post);
    expect(html).toContain("<h2>Sources</h2>");
    expect(html).toContain('<a href="https://example.com/story" rel="noopener noreferrer">Company X &lt;update&gt;</a>');
  });

  it("escapes HTML special characters from model-generated content — no injection", () => {
    const post = makePost({
      outline: { h1: '<img src=x onerror=alert(1)>', h2: [] },
      sections: [{ type: "body", contentMarkdown: "<script>alert('xss')</script>" }],
    });
    const html = renderHtml(post);
    expect(html).not.toContain("<img src=x onerror=");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("renders faqs and callouts as real HTML elements", () => {
    const post = makePost({
      sections: [{ type: "body", contentMarkdown: "Body.", callout: { label: "Note", text: "Careful." } }],
      faqs: [{ question: "Why?", answer: "Because." }],
    });
    const html = renderHtml(post);
    expect(html).toContain("<blockquote>");
    expect(html).toContain("Note");
    expect(html).toContain("<h3>Why?</h3>");
    expect(html).toContain("Because.");
  });

  it("converts safe **bold**/*italic*/[link](https://...) markdown to real HTML tags", () => {
    const post = makePost({
      sections: [
        {
          type: "body",
          contentMarkdown: "This is **bold** and *italic* and a [link](https://example.com).",
        },
      ],
    });
    const html = renderHtml(post);
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toContain('<a href="https://example.com"');
  });

  it("never turns a javascript: URL into a clickable link", () => {
    const post = makePost({
      sections: [{ type: "body", contentMarkdown: "[click me](javascript:alert(1))" }],
    });
    const html = renderHtml(post);
    expect(html).not.toContain("<a href=\"javascript:");
  });
});
