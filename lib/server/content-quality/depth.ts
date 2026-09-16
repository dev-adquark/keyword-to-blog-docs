import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { DEPTH_TARGETS } from "./config";
import { tokenizeWords } from "./textStats";

/**
 * Word count alone is never treated as depth — this looks for concrete
 * signals that a section actually says something (numbers, named specifics,
 * examples, structured guidance) rather than padding around a vague claim.
 * This is a deterministic proxy signal; the LLM evaluator (llmEvaluator.ts)
 * supplements it with a genuine judgment-based depth score.
 */

const CONCRETE_MARKERS = [
  /\d/, // any digit — prices, counts, versions, steps
  /\bfor example\b/i,
  /\bfor instance\b/i,
  /\bsuch as\b/i,
  /\be\.g\.,?\b/i,
  /^[\s]*[-*•]/m, // markdown list item
  /^[\s]*\d+\.\s/m, // numbered list item
];

const VAGUE_CLAIM_PATTERNS = [
  /\bmany (?:experts|people|studies) (?:say|believe|show)\b/i,
  /\bit (?:can|could|may) (?:help|improve|boost)\b(?!.*\d)/i, // vague benefit claim with no number nearby
  /\bin many cases\b/i,
];

export interface DepthResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

function hasConcreteMarker(text: string): boolean {
  return CONCRETE_MARKERS.some((p) => p.test(text));
}

export function evaluateDepth(post: SEOPostV1, brief: ContentBrief): DepthResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  const bodySections = post.sections.filter((s) => s.type === "body" && s.contentMarkdown);
  if (bodySections.length === 0) {
    failed.push({
      code: "NO_BODY_SECTIONS",
      severity: "blocking",
      message: "The article has no body sections with real content.",
    });
  }

  for (const s of bodySections) {
    const text = s.contentMarkdown!;
    const words = tokenizeWords(text).length;
    const concrete = hasConcreteMarker(text);

    if (words < DEPTH_TARGETS.minWordsPerSection) {
      failed.push({
        code: "LOW_EXPERT_DEPTH",
        severity: "blocking",
        message: `Section "${s.heading ?? "body"}" has only ${words} words — too short to cover the topic with any depth.`,
        section: s.heading,
      });
      continue;
    }

    if (!concrete) {
      failed.push({
        code: "LOW_EXPERT_DEPTH",
        severity: "warning",
        message: `Section "${s.heading ?? "body"}" lacks concrete guidance or examples (no numbers, named specifics, or "for example"/list-style detail).`,
        section: s.heading,
      });
    }

    const vagueHits = VAGUE_CLAIM_PATTERNS.filter((p) => p.test(text)).length;
    if (vagueHits > 0) {
      warnings.push(`Section "${s.heading ?? "body"}" contains a vague, unsupported claim.`);
    }
  }

  if (brief.requiredConcepts.length > 0) {
    const allText = post.sections.map((s) => s.contentMarkdown ?? "").join(" ").toLowerCase();
    const missing = brief.requiredConcepts.filter((c) => !allText.includes(c.toLowerCase()));
    if (missing.length > 0) {
      warnings.push(`Related concept(s) never mentioned: ${missing.join(", ")}.`);
    }
  }

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const warningCount = failed.filter((f) => f.severity === "warning").length;
  const score = Math.max(0, 100 - blockingCount * 25 - warningCount * 10);

  return { score, failedChecks: failed, warnings };
}
