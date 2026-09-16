import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { KEYWORD_STUFFING } from "./config";
import { countPhraseOccurrences, wordCount, collectSectionProse } from "./textStats";

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

  const primaryKeywordOccurrences = brief.primaryKeyword
    ? countPhraseOccurrences(fullText, brief.primaryKeyword)
    : 0;

  if (brief.primaryKeyword && primaryKeywordOccurrences === 0) {
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
    const count = countPhraseOccurrences(fullText, term);
    relatedKeywordOccurrences += count;
    if (count > 0) coveredRelated++;
  }

  const totalConcepts = 1 + brief.relatedKeywords.length;
  const coveredConcepts = (primaryKeywordOccurrences > 0 ? 1 : 0) + coveredRelated;
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
