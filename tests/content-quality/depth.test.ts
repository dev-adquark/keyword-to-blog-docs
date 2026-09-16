import { describe, expect, it } from "vitest";
import { evaluateDepth } from "@/lib/server/content-quality/depth";
import { baseBrief, goodPost } from "./fixtures";

describe("evaluateDepth", () => {
  it("passes a post with genuinely concrete, sufficiently long sections", () => {
    const result = evaluateDepth(goodPost(), baseBrief());
    expect(result.failedChecks.filter((f) => f.severity === "blocking")).toHaveLength(0);
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("flags a shallow section that pads word count without saying much", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "Choosing Password Length",
          contentMarkdown: "Passwords should be long. Longer is better. Keep it long.",
        },
      ],
    });
    const result = evaluateDepth(post, baseBrief());
    expect(
      result.failedChecks.some((f) => f.code === "LOW_EXPERT_DEPTH" && f.section === "Choosing Password Length")
    ).toBe(true);
  });

  it("flags a section with enough words but no concrete markers (no numbers, examples, or lists)", () => {
    const vagueParagraph =
      "Many people believe that passwords are simply a matter of personal preference and habit, and that " +
      "thinking about them too much is unnecessary for most everyday users going about their normal digital lives " +
      "without much concern for what could possibly go wrong in the long run if they are not careful about it. " +
      "It generally helps to take the whole matter a little more seriously than most people currently tend to, " +
      "even without getting into any particular specifics about how exactly one might go about doing that here.";
    const post = goodPost({
      sections: [{ type: "body", heading: "General Thoughts", contentMarkdown: vagueParagraph }],
    });
    const result = evaluateDepth(post, baseBrief());
    expect(result.failedChecks.some((f) => f.code === "LOW_EXPERT_DEPTH" && f.severity === "warning")).toBe(true);
  });

  it("does not treat word count alone as sufficient depth", () => {
    const repeatedVague = Array.from({ length: 20 }, () => "It can help improve your overall situation somewhat.").join(" ");
    const post = goodPost({
      sections: [{ type: "body", heading: "Padded", contentMarkdown: repeatedVague }],
    });
    const result = evaluateDepth(post, baseBrief());
    // Long word count, but no concrete markers at all — must still be flagged.
    expect(result.failedChecks.some((f) => f.code === "LOW_EXPERT_DEPTH")).toBe(true);
  });
});
