import { describe, expect, it } from "vitest";
import { evaluateStructure } from "@/lib/server/content-quality/structure";
import { goodPost } from "./fixtures";

describe("evaluateStructure", () => {
  it("passes a well-structured post", () => {
    const result = evaluateStructure(goodPost());
    expect(result.failedChecks.filter((f) => f.severity === "blocking")).toHaveLength(0);
  });

  it("flags two introduction sections as invalid structure", () => {
    const post = goodPost({
      sections: [
        { type: "introduction", contentMarkdown: "Intro one with enough words to pass other checks easily here." },
        { type: "introduction", contentMarkdown: "Intro two with enough words to pass other checks easily here." },
        ...goodPost().sections.slice(2),
      ],
    });
    const result = evaluateStructure(post);
    expect(result.failedChecks.some((f) => f.code === "STRUCTURE_INVALID" && f.severity === "blocking")).toBe(true);
  });

  it("warns (does not block) when there is no introduction section at all", () => {
    const post = goodPost({ sections: goodPost().sections.filter((s) => s.type !== "introduction") });
    const result = evaluateStructure(post);
    const missingIntro = result.failedChecks.find((f) => f.code === "STRUCTURE_INVALID");
    expect(missingIntro?.severity).toBe("warning");
  });

  it("rejects duplicate H2 headings in outline.h2", () => {
    const post = goodPost({ outline: { h1: "H1", h2: ["Same", "Same"] } });
    const result = evaluateStructure(post);
    expect(result.failedChecks.some((f) => f.code === "STRUCTURE_INVALID" && f.severity === "blocking")).toBe(true);
  });

  it("flags DUPLICATE_CONCLUSION when a conclusion-type section has its own real content", () => {
    const post = goodPost({
      sections: [
        ...goodPost().sections,
        { type: "conclusion", heading: "Wrapping Up", contentMarkdown: "A whole separate closing section." },
      ],
    });
    const result = evaluateStructure(post);
    expect(result.failedChecks.some((f) => f.code === "DUPLICATE_CONCLUSION")).toBe(true);
  });

  it("does not flag DUPLICATE_CONCLUSION when there is no conclusion-type section", () => {
    const result = evaluateStructure(goodPost());
    expect(result.failedChecks.some((f) => f.code === "DUPLICATE_CONCLUSION")).toBe(false);
  });
});
