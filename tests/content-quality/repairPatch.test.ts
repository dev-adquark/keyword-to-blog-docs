import { describe, expect, it } from "vitest";
import { applyRepairPatch } from "@/lib/server/content-quality/repairPatch";
import { goodPost } from "./fixtures";

describe("applyRepairPatch", () => {
  it("returns the post unchanged when the patch is empty", () => {
    const post = goodPost();
    expect(applyRepairPatch(post, {})).toEqual(post);
  });

  it("only replaces the specifically patched section, preserving every other section verbatim", () => {
    const post = goodPost();
    const patched = applyRepairPatch(post, {
      sections: [{ index: 1, contentMarkdown: "Brand new content for section 1 only." }],
    });

    expect(patched.sections[1]?.contentMarkdown).toBe("Brand new content for section 1 only.");
    // Every other section is byte-for-byte the original.
    patched.sections.forEach((s, i) => {
      if (i !== 1) expect(s).toEqual(post.sections[i]);
    });
    // Top-level fields untouched by the patch stay exactly as they were.
    expect(patched.title).toBe(post.title);
    expect(patched.conclusion).toBe(post.conclusion);
  });

  it("merges a partial meta patch without clobbering the field the patch didn't mention", () => {
    const post = goodPost();
    const patched = applyRepairPatch(post, { meta: { description: "A new description." } });
    expect(patched.meta.description).toBe("A new description.");
    expect(patched.meta.primaryKeyword).toBe(post.meta.primaryKeyword);
  });

  it("replaces faqs wholesale when the patch includes them (the model returns the full corrected list)", () => {
    const post = goodPost({ faqs: [{ question: "Old?", answer: "Old answer here that is long enough." }] });
    const patched = applyRepairPatch(post, {
      faqs: [{ question: "New?", answer: "New answer here that is long enough too." }],
    });
    expect(patched.faqs).toEqual([{ question: "New?", answer: "New answer here that is long enough too." }]);
  });

  it("updates a section's heading only, leaving its content untouched", () => {
    const post = goodPost();
    const patched = applyRepairPatch(post, { sections: [{ index: 0, heading: "New Heading" }] });
    expect(patched.sections[0]?.heading).toBe("New Heading");
    expect(patched.sections[0]?.contentMarkdown).toBe(post.sections[0]?.contentMarkdown);
  });

  it("ignores a patch section index that doesn't exist in the post", () => {
    const post = goodPost();
    const patched = applyRepairPatch(post, { sections: [{ index: 999, contentMarkdown: "orphaned" }] });
    expect(patched.sections).toEqual(post.sections);
  });
});
