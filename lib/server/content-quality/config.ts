import "server-only";
import { env } from "../env";

/**
 * Centralized, single-source-of-truth configuration for the content quality
 * pipeline. Nothing in lib/server/content-quality/* should hardcode a
 * threshold — everything comes from here so the whole system can be tuned
 * (or A/B'd) in one place.
 */

export const QUALITY_VERSION = "1.0.0";

/** Bumping any of these is a product decision, not a code change — keep them
 * together so the tradeoffs are visible in one place. 0-100 scale throughout. */
export const QUALITY_THRESHOLDS = {
  overall: 78,
  writing: 65,
  originality: 70,
  depth: 65,
  seo: 70,
  readability: 60,
  keyword: 60,
  structure: 80,
};

export function getMaxRevisions(): number {
  return env.CONTENT_QUALITY_MAX_REVISIONS;
}

export const REPETITION_THRESHOLDS = {
  /** A 4+ word phrase repeated more than this many times, verbatim, is stuffing/boilerplate. */
  maxExactPhraseRepeats: 3,
  /** Two distinct sentences with word-set (Jaccard) similarity at/above this are "near-duplicate". */
  nearDuplicateSimilarity: 0.82,
  /** Ratio of near-duplicate sentence pairs to total sentences before it's a blocking failure. */
  maxNearDuplicateRatio: 0.12,
};

export const KEYWORD_STUFFING = {
  /** primaryKeyword occurrences / total words, above which is unnatural. */
  maxDensity: 0.035,
};

export const DEPTH_TARGETS = {
  minWordsPerSection: 60,
};

export const READABILITY_TARGETS = {
  maxAvgSentenceWords: 32,
  maxAvgParagraphWords: 200,
};

/** Only these languages get the English-specific phrase/pattern checks
 * (writingQuality, spamDetection generic-phrase lists) — see section 36:
 * never run English pattern rules against other languages and call it signal. */
export const ENGLISH_LANGUAGE_CODES = new Set(["en", "en-us", "en-gb", "en-au", "en-ca"]);

export function isEnglish(languageCode: string): boolean {
  return ENGLISH_LANGUAGE_CODES.has(languageCode.trim().toLowerCase());
}
