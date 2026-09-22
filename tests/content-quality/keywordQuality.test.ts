import { describe, expect, it } from "vitest";
import { evaluateKeywordQuality } from "@/lib/server/content-quality/keywordQuality";
import { baseBrief, goodPost } from "./fixtures";

describe("evaluateKeywordQuality", () => {
  it("passes a post that naturally covers the primary keyword and related terms", () => {
    const result = evaluateKeywordQuality(goodPost(), baseBrief());
    expect(result.failedChecks.filter((f) => f.severity === "blocking")).toHaveLength(0);
    expect(result.keywordCoverage).toBeGreaterThan(0);
  });

  it("flags a completely missing primary keyword", () => {
    const post = goodPost();
    const result = evaluateKeywordQuality(post, baseBrief({ primaryKeyword: "quantum encryption widgets" }));
    expect(result.failedChecks.some((f) => f.code === "MISSING_PRIMARY_KEYWORD")).toBe(true);
  });

  it("REGRESSION: does not block a genuinely on-topic article just because it paraphrases the exact keyword phrase (plural vs. singular, different word order)", () => {
    const post = goodPost({
      title: "How to Build a Strong Password",
      sections: [
        {
          type: "body",
          heading: "Building strong passwords",
          contentMarkdown:
            "A strong password is your first line of defense. Using a strong password consistently across every account, rather than a weak password reused everywhere, meaningfully reduces the risk of a breach.",
        },
      ],
    });
    // Primary keyword is the plural "strong passwords" — the article
    // naturally uses the singular "strong password" throughout, which is
    // clearly the same topic and should not be treated as missing.
    const result = evaluateKeywordQuality(post, baseBrief({ primaryKeyword: "strong passwords" }));
    expect(result.failedChecks.some((f) => f.code === "MISSING_PRIMARY_KEYWORD")).toBe(false);
  });

  it("REGRESSION: does not require the literal word 'today' to appear — a freshness-sensitive topic like 'stock market today' can be genuinely on-topic without that exact word (e.g. when accurately dated content spans several days, not literally 'today')", () => {
    const post = goodPost({
      title: "Global Markets Rally on Oil Retreat and Tech Strength",
      sections: [
        {
          type: "body",
          heading: "Markets this week",
          contentMarkdown:
            "Financial markets have entered a rally phase this week, buoyed by declining oil prices and resurgent strength in the stock market. The broader market has continued its advance across multiple sessions.",
        },
      ],
      conclusion: "The stock market's rally reflects renewed investor confidence heading into the final quarter.",
    });
    // Found live: this was a real production bug, discovered via a real
    // generation where the rewriter (correctly) avoided the word "today"
    // because the 7-day source pack wasn't all from today, which then
    // falsely triggered MISSING_PRIMARY_KEYWORD on "today" alone even
    // though the article was clearly, thoroughly about the stock market.
    const result = evaluateKeywordQuality(post, baseBrief({ primaryKeyword: "stock market today" }));
    expect(result.failedChecks.some((f) => f.code === "MISSING_PRIMARY_KEYWORD")).toBe(false);
  });

  it("flags keyword stuffing when density is unnaturally high", () => {
    const stuffed = Array.from({ length: 15 }, () => "strong password strong password strong password").join(" ");
    const post = goodPost({
      sections: [{ type: "body", heading: "Stuffed", contentMarkdown: stuffed }],
    });
    const result = evaluateKeywordQuality(post, baseBrief());
    expect(result.failedChecks.some((f) => f.code === "KEYWORD_STUFFING")).toBe(true);
  });

  it("does not use a fixed keyword-count rule — natural single-digit usage across a long article is fine", () => {
    const result = evaluateKeywordQuality(goodPost(), baseBrief());
    expect(result.primaryKeywordOccurrences).toBeGreaterThan(0);
    expect(result.primaryKeywordOccurrences).toBeLessThan(10);
    expect(result.failedChecks.some((f) => f.code === "KEYWORD_STUFFING")).toBe(false);
  });
});
