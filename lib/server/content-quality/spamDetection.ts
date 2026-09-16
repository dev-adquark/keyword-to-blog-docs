import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { isEnglish } from "./config";
import { countPhraseOccurrences } from "./textStats";

/**
 * Spam-pattern checks distinct from keywordQuality.ts's density math: this
 * looks at *where* and *how* keywords/commercial language show up (headings
 * that are just the keyword restated, salesy phrasing) rather than raw counts.
 */
export interface SpamDetectionResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

const COMMERCIAL_SPAM_PATTERNS = [
  /\bclick here\b/i,
  /\bact now\b/i,
  /\blimited time offer\b/i,
  /\bbuy now\b/i,
  /\bact fast\b/i,
];

export function evaluateSpamSignals(post: SEOPostV1, brief: ContentBrief, language: string): SpamDetectionResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  if (brief.primaryKeyword) {
    for (const h2 of post.outline.h2) {
      const normalized = h2.trim().toLowerCase();
      if (normalized === brief.primaryKeyword.trim().toLowerCase()) {
        failed.push({
          code: "KEYWORD_STUFFED_HEADING",
          severity: "warning",
          message: `Heading "${h2}" is just the exact primary keyword restated, with no added meaning.`,
        });
      }
    }
  }

  const headingKeywordRepeats = post.outline.h2.filter(
    (h2) => brief.primaryKeyword && countPhraseOccurrences(h2, brief.primaryKeyword) > 0
  ).length;
  if (post.outline.h2.length >= 3 && headingKeywordRepeats === post.outline.h2.length) {
    failed.push({
      code: "KEYWORD_STUFFED_HEADING",
      severity: "warning",
      message: "Every single H2 heading repeats the primary keyword — reads as keyword stuffing rather than natural structure.",
    });
  }

  if (isEnglish(language)) {
    for (const s of post.sections) {
      const text = s.contentMarkdown ?? "";
      if (COMMERCIAL_SPAM_PATTERNS.some((p) => p.test(text))) {
        failed.push({
          code: "COMMERCIAL_SPAM_LANGUAGE",
          severity: "warning",
          message: `Section "${s.heading ?? s.type}" contains pushy sales language ("click here", "act now", etc.) out of place in informational content.`,
          section: s.heading,
        });
      }
    }
  } else {
    warnings.push(`Commercial-spam phrase checks are English-only and were skipped for language "${language}".`);
  }

  const warningCount = failed.length; // all spam signals here are warnings, not hard blockers on their own
  const score = Math.max(0, 100 - warningCount * 12);

  return { score, failedChecks: failed, warnings };
}
