import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { KEYWORD_STUFFING } from "./config";
import { countPhraseOccurrences, tokenizeWords, wordCount, collectSectionProse } from "./textStats";

/** Tolerates a trivial singular/plural mismatch ("vehicle" vs. "vehicles")
 * — mirrors lib/server/sources/relevance.ts's fix for the same problem on
 * the source-retrieval side. Not stemming, just the one common variant. */
function containsTermTolerant(haystackLower: string, term: string): boolean {
  if (haystackLower.includes(term)) return true;
  if (term.endsWith("s") && term.length > 3) return haystackLower.includes(term.slice(0, -1));
  return haystackLower.includes(`${term}s`);
}

function significantTermsOf(phrase: string): string[] {
  return [...new Set(tokenizeWords(phrase).filter((w) => w.length > 2 || /\d/.test(w)))];
}

/**
 * Whether a keyword/topic PHRASE is covered by the article — every
 * significant word must appear somewhere (tolerating plural/singular), but
 * NOT necessarily as one exact, contiguous, verbatim phrase in that order.
 * Requiring the literal phrase (the old behavior) rejected genuinely
 * on-topic, well-written articles that naturally varied the phrasing (word
 * order, grammatical number) instead of mechanically repeating the exact
 * request string — which real SEO writing practice actively prefers over
 * exact-match keyword stuffing anyway.
 */
function isKeywordPhraseCovered(fullTextLower: string, phrase: string): boolean {
  const terms = significantTermsOf(phrase);
  if (terms.length === 0) return true;
  return terms.every((t) => containsTermTolerant(fullTextLower, t));
}

export interface KeywordQualityResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
  keywordCoverage: number;
  primaryKeywordOccurrences: number;
  relatedKeywordOccurrences: number;
}

/**
 * Natural usage over arbitrary density: there is no "keyword must appear N
 * times" rule. Coverage is measured by presence of the primary keyword and
 * how many related terms/concepts show up at all; stuffing is measured by
 * density crossing an unnatural threshold, not by counting occurrences
 * against a fixed target.
 */
export function evaluateKeywordQuality(post: SEOPostV1, brief: ContentBrief): KeywordQualityResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  const fullText = [
    post.title,
    post.meta.description,
    ...post.outline.h2,
    ...collectSectionProse(post.sections),
    post.conclusion,
  ].join(" ");
  const totalWords = Math.max(1, wordCount(fullText));
  const fullTextLower = fullText.toLowerCase();

  // Exact-phrase count is still what stuffing/density is measured against
  // below — literal repetition IS the concern for stuffing specifically.
  const primaryKeywordOccurrences = brief.primaryKeyword
    ? countPhraseOccurrences(fullText, brief.primaryKeyword)
    : 0;
  const primaryKeywordCovered = !brief.primaryKeyword || isKeywordPhraseCovered(fullTextLower, brief.primaryKeyword);

  if (brief.primaryKeyword && !primaryKeywordCovered) {
    failed.push({
      code: "MISSING_PRIMARY_KEYWORD",
      severity: "blocking",
      message: `The primary keyword/topic "${brief.primaryKeyword}" never appears in the article.`,
    });
  }

  const density = primaryKeywordOccurrences / totalWords;
  if (density > KEYWORD_STUFFING.maxDensity) {
    failed.push({
      code: "KEYWORD_STUFFING",
      severity: "blocking",
      message: `The primary keyword appears ${primaryKeywordOccurrences} times in ${totalWords} words (${(density * 100).toFixed(1)}% density) — unnaturally repetitive.`,
    });
  }

  let relatedKeywordOccurrences = 0;
  let coveredRelated = 0;
  for (const term of brief.relatedKeywords) {
    relatedKeywordOccurrences += countPhraseOccurrences(fullText, term);
    if (isKeywordPhraseCovered(fullTextLower, term)) coveredRelated++;
  }

  const totalConcepts = 1 + brief.relatedKeywords.length;
  const coveredConcepts = (primaryKeywordCovered ? 1 : 0) + coveredRelated;
  const keywordCoverage = totalConcepts > 0 ? coveredConcepts / totalConcepts : 1;

  if (brief.relatedKeywords.length > 0 && keywordCoverage < 0.5) {
    warnings.push(
      `Only ${coveredRelated}/${brief.relatedKeywords.length} related keywords appear anywhere in the article.`
    );
  }

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const warningCount = failed.length - blockingCount;
  const score = Math.max(0, 100 - blockingCount * 35 - warningCount * 10 - (1 - keywordCoverage) * 20);

  return {
    score,
    failedChecks: failed,
    warnings,
    keywordCoverage,
    primaryKeywordOccurrences,
    relatedKeywordOccurrences,
  };
}
