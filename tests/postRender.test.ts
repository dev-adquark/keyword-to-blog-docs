import { describe, expect, it } from "vitest";
import {
  renderMarkdown,
  renderHtml,
  countWords,
  enforceSectionConstraint,
  assertWordCountWithinTolerance,
  stripSourceContent,
  stripLinksAndCitations,
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
  it("counts words across all sections plus the conclusion", () => {
    const post = makePost();
    // "Intro text here." (3) + "Body text with several words in it." (7) + "The conclusion." (2)
    expect(countWords(post)).toBe(12);
  });

  it("REGRESSION: also counts callout text and FAQ question/answer text — the old function silently ignored these, which could make a genuinely long-enough article look short enough to fail minWords", () => {
    const post = makePost({
      sections: [{ type: "body", contentMarkdown: "Body text here.", callout: { label: "Note", text: "Callout text with five words." } }],
      faqs: [{ question: "A short question?", answer: "A short answer with more words." }],
      conclusion: "Final words.",
    });
    // "Body text here." (3) + "Callout text with five words." (5) + "A short question?" (3) + "A short answer with more words." (6) + "Final words." (2)
    expect(countWords(post)).toBe(19);
  });

  it("does not count the title, headings, or meta description", () => {
    const post = makePost({
      title: "A very long title with many extra words in it",
      outline: { h1: "Another long heading with several words", h2: ["A heading with words", "Another heading"] },
      sections: [{ type: "body", contentMarkdown: "One two three." }],
      conclusion: "",
    });
    expect(countWords(post)).toBe(3);
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

  it("REGRESSION: grows back past maxSections rather than truncating a valid article below minWords", () => {
    const post = makePost({
      sections: [
        { type: "introduction", contentMarkdown: "one two three four five six seven eight nine ten." },
        { type: "body", contentMarkdown: "eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty." },
        { type: "body", contentMarkdown: "twentyone twentytwo twentythree twentyfour twentyfive twentysix twentyseven twentyeight twentynine thirty." },
      ],
      conclusion: "",
    });
    // maxSections: 1 would leave only 10 words, well under minWords: 25 —
    // truncation must keep growing until the total clears the minimum.
    const result = enforceSectionConstraint(post, { maxWords: 1000, minWords: 25, maxSections: 1 });
    expect(result.sections.length).toBeGreaterThan(1);
    expect(countWords(result)).toBeGreaterThanOrEqual(25);
  });

  it("still truncates to maxSections when doing so already satisfies minWords", () => {
    const post = makePost({
      sections: [
        { type: "introduction", contentMarkdown: "one two three four five six seven eight nine ten." },
        { type: "body", contentMarkdown: "eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty." },
        { type: "body", contentMarkdown: "extra section that would be cut." },
      ],
      conclusion: "",
    });
    const result = enforceSectionConstraint(post, { maxWords: 1000, minWords: 15, maxSections: 2 });
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

  it("passes cleanly for a word count within the requested range", () => {
    expect(() => assertWordCountWithinTolerance(650, { maxWords: 900, minWords: 500 })).not.toThrow();
  });

  it("REGRESSION: reports exact diagnostics (actual/min/max words) on failure, not just a generic message", () => {
    try {
      assertWordCountWithinTolerance(20, { maxWords: 900, minWords: 500 });
      throw new Error("expected assertWordCountWithinTolerance to throw");
    } catch (err) {
      const apiErr = err as { message: string; details?: Record<string, unknown> };
      expect(apiErr.message).toMatch(/20/);
      expect(apiErr.message).toMatch(/500/);
      expect(apiErr.message).toMatch(/900/);
      expect(apiErr.details).toEqual({ actualWords: 20, minWords: 500, maxWords: 900 });
    }
  });

  it("REGRESSION: reports exact diagnostics on an over-budget failure too", () => {
    try {
      assertWordCountWithinTolerance(2000, { maxWords: 900 });
      throw new Error("expected assertWordCountWithinTolerance to throw");
    } catch (err) {
      const apiErr = err as { message: string; details?: Record<string, unknown> };
      expect(apiErr.message).toMatch(/2000/);
      expect(apiErr.message).toMatch(/900/);
      expect(apiErr.details).toEqual({ actualWords: 2000, minWords: null, maxWords: 900 });
    }
  });

  it("REGRESSION (end-to-end): a post whose section prose alone looks short does not falsely fail minWords once conclusion/FAQs/callouts are correctly counted", () => {
    // Reproduces the real reported bug: countWords() used to only count
    // section.contentMarkdown, silently ignoring the conclusion and every
    // FAQ, so a genuinely long-enough article could look like it fell
    // under half of minWords and fail with INTERNAL_ERROR.
    const post = makePost({
      sections: [
        { type: "introduction", contentMarkdown: Array(60).fill("word").join(" ") },
        { type: "body", contentMarkdown: "Short body.", callout: { label: "Note", text: Array(20).fill("word").join(" ") } },
      ],
      faqs: [
        { question: "First question?", answer: Array(40).fill("word").join(" ") },
        { question: "Second question?", answer: Array(40).fill("word").join(" ") },
      ],
      conclusion: Array(30).fill("word").join(" "),
    });
    const words = countWords(post);
    expect(words).toBeGreaterThanOrEqual(190); // 60+2+1+20+2+40+2+40+30 ≈ 197, well over half of 300
    expect(() => assertWordCountWithinTolerance(words, { maxWords: 400, minWords: 300 })).not.toThrow();
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

  it("REGRESSION: NEVER renders a Sources section or any source URL, even when post.sources is populated (published content must contain zero source links)", () => {
    const post = makePost({
      sources: [
        { title: "Company X launches new product", url: "https://example.com/story", publishedAt: "2026-09-21T10:00:00.000Z" },
      ],
    });
    const md = renderMarkdown(post);
    expect(md).not.toContain("## Sources");
    expect(md).not.toContain("https://example.com/story");
    expect(md).not.toMatch(/https?:\/\//);
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

  it("REGRESSION: NEVER renders a Sources section or any source URL/anchor, even when post.sources is populated", () => {
    const post = makePost({
      sources: [{ title: "Company X <update>", url: "https://example.com/story", publishedAt: null }],
    });
    const html = renderHtml(post);
    expect(html).not.toContain("<h2>Sources</h2>");
    expect(html).not.toContain("https://example.com/story");
    expect(html).not.toContain("<a ");
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

  it("converts safe **bold**/*italic* markdown to real HTML tags, but never a markdown link to a clickable anchor (published content must contain zero links)", () => {
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
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("https://example.com");
  });

  it("never turns a javascript: URL into a clickable link", () => {
    const post = makePost({
      sections: [{ type: "body", contentMarkdown: "[click me](javascript:alert(1))" }],
    });
    const html = renderHtml(post);
    expect(html).not.toContain("<a href=\"javascript:");
  });
});

describe("stripLinksAndCitations", () => {
  it("strips a raw URL, leaving the surrounding prose", () => {
    expect(stripLinksAndCitations("Read more at https://example.com/article for details.")).toBe(
      "Read more at for details."
    );
  });

  it("strips a markdown link, keeping the label text", () => {
    expect(stripLinksAndCitations("According to [the report](https://example.com/report), sales rose.")).toBe(
      "According to the report, sales rose."
    );
  });

  it("unwraps an HTML anchor tag, keeping the inner text", () => {
    expect(stripLinksAndCitations('See <a href="https://example.com">this article</a> for more.')).toBe(
      "See this article for more."
    );
  });

  it("strips a numeric citation bracket", () => {
    expect(stripLinksAndCitations("Sales rose 12%[1] year over year.")).toBe("Sales rose 12% year over year.");
  });

  it("strips a (Source: ...) style attribution", () => {
    expect(stripLinksAndCitations("Revenue grew 12% (Source: Bloomberg).")).toBe("Revenue grew 12%.");
  });

  it("leaves ordinary prose with no links completely unchanged", () => {
    const text = "This is a completely ordinary sentence with no links or citations at all.";
    expect(stripLinksAndCitations(text)).toBe(text);
  });
});

describe("stripSourceContent", () => {
  it("REGRESSION: strips URLs/markdown links from every text field of the post — title, meta description, headings, sections, callouts, faqs, conclusion", () => {
    const post = makePost({
      title: "Report (https://example.com/report) shows growth",
      meta: { description: "See [details](https://example.com/x)", primaryKeyword: "kw" },
      outline: { h1: "Overview https://example.com/h1", h2: ["Section https://example.com/h2"] },
      sections: [
        { type: "body", heading: "Data https://example.com/heading", contentMarkdown: "Growth was 12% [source](https://example.com/body)." },
        { type: "body", contentMarkdown: "Text", callout: { label: "Note", text: "See https://example.com/callout" } },
      ],
      faqs: [{ question: "Why https://example.com/q?", answer: "Because [this](https://example.com/a)." }],
      conclusion: "In summary, see https://example.com/conclusion.",
    });

    const stripped = stripSourceContent(post);
    const allText = JSON.stringify(stripped);
    expect(allText).not.toMatch(/https?:\/\//);
    expect(allText).not.toContain("[source]");
    expect(allText).not.toContain("[details]");
  });

  it("removes a 'Sources'/'References' section entirely, not just the links within it", () => {
    const post = makePost({
      sections: [
        { type: "body", heading: "Real content", contentMarkdown: "This is the real article body." },
        { type: "body", heading: "Sources", contentMarkdown: "- Article one\n- Article two" },
      ],
      outline: { h1: "Main Heading", h2: ["Real content", "Sources"] },
    });
    const stripped = stripSourceContent(post);
    expect(stripped.sections.some((s) => s.heading?.toLowerCase() === "sources")).toBe(false);
    expect(stripped.sections).toHaveLength(1);
    expect(stripped.outline.h2).not.toContain("Sources");
  });

  it("removes a 'References' or 'Further reading' section too (case-insensitive)", () => {
    const post = makePost({
      sections: [
        { type: "body", heading: "Real content", contentMarkdown: "Body." },
        { type: "body", heading: "References", contentMarkdown: "Stuff." },
        { type: "body", heading: "Further Reading", contentMarkdown: "More stuff." },
      ],
    });
    const stripped = stripSourceContent(post);
    expect(stripped.sections).toHaveLength(1);
  });

  it("never touches post.sources itself — that's internal citation-tracking metadata, not published content", () => {
    const post = makePost({
      sources: [{ title: "Real source", url: "https://example.com/real", publishedAt: "2026-09-21T00:00:00.000Z" }],
    });
    const stripped = stripSourceContent(post);
    expect(stripped.sources).toEqual([{ title: "Real source", url: "https://example.com/real", publishedAt: "2026-09-21T00:00:00.000Z" }]);
  });

  it("leaves ordinary content with no links completely unaffected", () => {
    const post = makePost();
    const stripped = stripSourceContent(post);
    expect(stripped.title).toBe(post.title);
    expect(stripped.sections[0]!.contentMarkdown).toBe(post.sections[0]!.contentMarkdown);
    expect(stripped.conclusion).toBe(post.conclusion);
  });
});
