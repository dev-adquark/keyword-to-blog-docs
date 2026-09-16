import { describe, expect, it } from "vitest";
import { evaluateReadability } from "@/lib/server/content-quality/readability";
import { baseBrief, goodPost } from "./fixtures";

describe("evaluateReadability", () => {
  it("accepts a post with reasonably sized sentences and paragraphs", () => {
    const result = evaluateReadability(goodPost(), baseBrief());
    expect(result.failedChecks).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });

  it("flags overly long sentences", () => {
    const longSentence =
      "This is a single, extremely long sentence that keeps going and going without ever pausing for breath, " +
      "adding clause after clause after clause about passwords and security and length and complexity and best " +
      "practices and password managers and two-factor authentication and account recovery and phishing resistance " +
      "until it becomes genuinely difficult for any reader to track what the actual point of the sentence even was.";
    const post = goodPost({
      sections: [{ type: "body", heading: "Long", contentMarkdown: longSentence }],
    });
    const result = evaluateReadability(post, baseBrief());
    expect(result.failedChecks.some((f) => f.code === "SENTENCES_TOO_LONG")).toBe(true);
  });

  it("uses a stricter sentence-length target for a beginner/general audience", () => {
    const moderateSentence =
      "Choosing a good password means picking something long enough that it resists automated guessing attempts " +
      "from attackers who have access to powerful cracking hardware and large dictionaries of common passwords.";
    const post = goodPost({ sections: [{ type: "body", heading: "Mid", contentMarkdown: moderateSentence }] });

    const generalResult = evaluateReadability(post, baseBrief({ audience: "general consumers" }));
    const expertResult = evaluateReadability(post, baseBrief({ audience: "security experts" }));

    // Same content should be judged more strictly for a general audience.
    expect(generalResult.score).toBeLessThanOrEqual(expertResult.score);
  });
});
