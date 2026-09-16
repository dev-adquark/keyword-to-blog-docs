import { describe, expect, it } from "vitest";
import { evaluateOriginality } from "@/lib/server/content-quality/originality";
import { goodPost } from "./fixtures";

describe("evaluateOriginality", () => {
  it("passes a genuinely original post", () => {
    const result = evaluateOriginality(goodPost());
    expect(result.failedChecks.filter((f) => f.severity === "blocking")).toHaveLength(0);
  });

  it("flags a duplicate section heading", () => {
    const post = goodPost({
      sections: [
        { type: "body", heading: "Same Heading", contentMarkdown: "Some real content goes here for this section." },
        { type: "body", heading: "Same Heading", contentMarkdown: "Some different content goes here for this one." },
      ],
    });
    const result = evaluateOriginality(post);
    expect(result.failedChecks.some((f) => f.code === "DUPLICATE_HEADING")).toBe(true);
  });

  it("flags near-duplicate sentences restating the same point", () => {
    const post = goodPost({
      sections: [
        {
          type: "body",
          heading: "One",
          contentMarkdown:
            "A strong password should be at least sixteen characters long to resist modern cracking tools effectively.",
        },
        {
          type: "body",
          heading: "Two",
          contentMarkdown:
            "A strong password needs to be at least sixteen characters long to resist modern cracking tools effectively.",
        },
      ],
    });
    const result = evaluateOriginality(post);
    expect(result.failedChecks.some((f) => f.code === "NEAR_DUPLICATE_SENTENCES")).toBe(true);
  });

  it("flags a 5-word phrase repeated excessively across the document", () => {
    const phrase = "the best way to protect";
    const post = goodPost({
      sections: [
        { type: "body", heading: "One", contentMarkdown: `${phrase} your account is length.` },
        { type: "body", heading: "Two", contentMarkdown: `${phrase} your data is length too.` },
        { type: "body", heading: "Three", contentMarkdown: `${phrase} yourself online is length also.` },
        { type: "body", heading: "Four", contentMarkdown: `${phrase} everything digital is length still.` },
      ],
    });
    const result = evaluateOriginality(post);
    expect(result.failedChecks.some((f) => f.code === "EXCESSIVE_PHRASE_REPETITION")).toBe(true);
  });

  it("caps the number of reported phrase-repetition violations rather than flooding failedChecks", () => {
    const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const post = goodPost({
      sections: [{ type: "body", heading: "One", contentMarkdown: `${words} ${words} ${words} ${words}` }],
    });
    const result = evaluateOriginality(post);
    const phraseFailures = result.failedChecks.filter((f) => f.code === "EXCESSIVE_PHRASE_REPETITION");
    expect(phraseFailures.length).toBeLessThanOrEqual(3);
  });
});
