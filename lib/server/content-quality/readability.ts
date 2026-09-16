import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { READABILITY_TARGETS } from "./config";
import { splitSentences, splitParagraphs, tokenizeWords, collectSectionProse } from "./textStats";

export interface ReadabilityResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

/**
 * Targets are adjusted by audience, not fixed for every article — a
 * "beginner"/general audience gets a stricter (lower) sentence-length
 * ceiling than a technical/expert one, since what counts as "readable"
 * genuinely depends on who's reading it.
 */
function targetForAudience(audience: string | undefined): number {
  const a = (audience ?? "").toLowerCase();
  if (/beginner|general|consumer|non-technical/.test(a)) return READABILITY_TARGETS.maxAvgSentenceWords - 8;
  if (/expert|technical|developer|professional/.test(a)) return READABILITY_TARGETS.maxAvgSentenceWords + 6;
  return READABILITY_TARGETS.maxAvgSentenceWords;
}

export function evaluateReadability(post: SEOPostV1, brief: ContentBrief): ReadabilityResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  const maxSentenceWords = targetForAudience(brief.audience);
  const prose = collectSectionProse(post.sections);
  if (prose.length === 0) {
    return { score: 100, failedChecks: [], warnings: [] };
  }

  let totalSentenceWords = 0;
  let sentenceCount = 0;
  let oversizedSentences = 0;
  let oversizedParagraphs = 0;
  let paragraphCount = 0;

  for (const text of prose) {
    const sentences = splitSentences(text);
    for (const s of sentences) {
      const w = tokenizeWords(s).length;
      totalSentenceWords += w;
      sentenceCount++;
      if (w > maxSentenceWords * 1.5) oversizedSentences++;
    }
    for (const p of splitParagraphs(text)) {
      paragraphCount++;
      if (tokenizeWords(p).length > READABILITY_TARGETS.maxAvgParagraphWords) oversizedParagraphs++;
    }
  }

  const avgSentenceWords = sentenceCount > 0 ? totalSentenceWords / sentenceCount : 0;

  if (avgSentenceWords > maxSentenceWords) {
    failed.push({
      code: "SENTENCES_TOO_LONG",
      severity: "warning",
      message: `Average sentence length is ${avgSentenceWords.toFixed(0)} words, above the ${maxSentenceWords}-word target for this audience.`,
    });
  }
  if (sentenceCount > 0 && oversizedSentences / sentenceCount > 0.15) {
    failed.push({
      code: "SENTENCES_TOO_LONG",
      severity: "warning",
      message: `${oversizedSentences} sentence(s) are extremely long and hard to follow.`,
    });
  }
  if (paragraphCount > 0 && oversizedParagraphs / paragraphCount > 0.3) {
    failed.push({
      code: "PARAGRAPHS_TOO_DENSE",
      severity: "warning",
      message: `${oversizedParagraphs} paragraph(s) are dense text walls with no break.`,
    });
  }

  const warningCount = failed.length; // readability issues are always warnings, never blocking
  const score = Math.max(0, 100 - warningCount * 15);

  return { score, failedChecks: failed, warnings };
}
