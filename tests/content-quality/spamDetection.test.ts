import { describe, expect, it } from "vitest";
import { evaluateSpamSignals } from "@/lib/server/content-quality/spamDetection";
import { baseBrief, goodPost } from "./fixtures";

describe("evaluateSpamSignals", () => {
  it("passes a natural, non-spammy post", () => {
    const result = evaluateSpamSignals(goodPost(), baseBrief(), "en");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("flags a heading that is just the exact primary keyword restated", () => {
    const post = goodPost({ outline: { h1: "H1", h2: ["strong password"] } });
    const result = evaluateSpamSignals(post, baseBrief(), "en");
    expect(result.failedChecks.some((f) => f.code === "KEYWORD_STUFFED_HEADING")).toBe(true);
  });

  it("flags pushy commercial sales language in informational content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "Buy", contentMarkdown: "Click here now to act now and buy now!" }],
    });
    const result = evaluateSpamSignals(post, baseBrief(), "en");
    expect(result.failedChecks.some((f) => f.code === "COMMERCIAL_SPAM_LANGUAGE")).toBe(true);
  });

  it("skips commercial-language checks for non-English content", () => {
    const post = goodPost({
      sections: [{ type: "body", heading: "Buy", contentMarkdown: "Click here now to act now and buy now!" }],
    });
    const result = evaluateSpamSignals(post, baseBrief(), "fr");
    expect(result.failedChecks.some((f) => f.code === "COMMERCIAL_SPAM_LANGUAGE")).toBe(false);
  });
});
