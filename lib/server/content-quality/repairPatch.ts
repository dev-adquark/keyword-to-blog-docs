import "server-only";
import type { RepairPatch, SEOPostV1 } from "@/lib/types";

/**
 * Merges a targeted repair patch onto the existing post — anything the
 * patch didn't mention is preserved exactly as-is. This is what makes the
 * repair call "never regenerate the entire article for a small issue": the
 * model only needs to return what changed, and this is where that gets
 * applied without disturbing everything else.
 */
export function applyRepairPatch(post: SEOPostV1, patch: RepairPatch): SEOPostV1 {
  const sections = post.sections.map((section, index) => {
    const patchedSection = patch.sections?.find((s) => s.index === index);
    if (!patchedSection) return section;
    return {
      ...section,
      ...(patchedSection.heading !== undefined ? { heading: patchedSection.heading } : {}),
      ...(patchedSection.contentMarkdown !== undefined
        ? { contentMarkdown: patchedSection.contentMarkdown }
        : {}),
    };
  });

  return {
    ...post,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.slugSuggestion !== undefined ? { slugSuggestion: patch.slugSuggestion } : {}),
    ...(patch.meta ? { meta: { ...post.meta, ...patch.meta } } : {}),
    sections,
    ...(patch.faqs !== undefined ? { faqs: patch.faqs } : {}),
    ...(patch.conclusion !== undefined ? { conclusion: patch.conclusion } : {}),
  };
}
