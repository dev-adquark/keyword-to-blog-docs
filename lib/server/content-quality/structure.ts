import "server-only";
import type { FailedCheck, SEOPostV1 } from "@/lib/types";
import { wordCount } from "./textStats";

/**
 * Document-level shape checks beyond what seoPostSchema (zod) already
 * guarantees — e.g. the schema requires at least one section and an h1, but
 * doesn't catch "two introduction sections" or "a body section that only
 * has a callout with two words in it".
 */
export interface StructureResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

const MIN_CALLOUT_WORDS = 5;

export function evaluateStructure(post: SEOPostV1): StructureResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  const introCount = post.sections.filter((s) => s.type === "introduction").length;
  if (introCount > 1) {
    failed.push({
      code: "STRUCTURE_INVALID",
      severity: "blocking",
      message: `The article has ${introCount} introduction-type sections; there should be exactly one.`,
    });
  }
  if (introCount === 0) {
    failed.push({
      code: "STRUCTURE_INVALID",
      severity: "warning",
      message: "The article has no dedicated introduction section.",
    });
  }

  // `post.conclusion` is the single canonical closing field (required by
  // schema); a `type: "conclusion"` section existing alongside it with real
  // content is redundant by construction — the renderer already refuses to
  // render it (see postRender.ts), but the JSON itself should be cleaned up
  // too so the post object stays internally consistent (see autoFix.ts).
  const conclusionSections = post.sections.filter((s) => s.type === "conclusion");
  if (conclusionSections.length > 1) {
    failed.push({
      code: "STRUCTURE_INVALID",
      severity: "warning",
      message: `The article has ${conclusionSections.length} conclusion-type sections in addition to the required "conclusion" field.`,
    });
  }
  if (conclusionSections.some((s) => s.contentMarkdown && s.contentMarkdown.trim().length > 0)) {
    failed.push({
      code: "DUPLICATE_CONCLUSION",
      severity: "warning",
      message:
        'A "conclusion"-type section has its own content in addition to the required top-level "conclusion" field — this is redundant and must not be rendered twice.',
    });
  }

  const firstIntroIndex = post.sections.findIndex((s) => s.type === "introduction");
  const lastBodyIndex = post.sections.map((s) => s.type).lastIndexOf("body");
  if (firstIntroIndex > 0 && lastBodyIndex >= 0 && firstIntroIndex > lastBodyIndex) {
    warnings.push("The introduction section appears after body content, which reads oddly.");
  }

  for (const s of post.sections) {
    if (s.callout && !s.contentMarkdown) {
      const words = wordCount(s.callout.text);
      if (words < MIN_CALLOUT_WORDS) {
        warnings.push(`A callout section has only ${words} word(s) — likely padding rather than useful content.`);
      }
    }
  }

  const h2Set = new Set(post.outline.h2.map((h) => h.trim().toLowerCase()));
  if (h2Set.size !== post.outline.h2.length) {
    failed.push({
      code: "STRUCTURE_INVALID",
      severity: "blocking",
      message: "outline.h2 contains duplicate headings.",
    });
  }

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const warningCount = failed.filter((f) => f.severity === "warning").length;
  const score = Math.max(0, 100 - blockingCount * 30 - warningCount * 10);

  return { score, failedChecks: failed, warnings };
}
