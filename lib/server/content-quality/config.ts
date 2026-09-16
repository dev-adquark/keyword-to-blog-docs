import "server-only";

/**
 * Centralized, single-source-of-truth configuration for the content quality
 * pipeline. Nothing in lib/server/content-quality/* should hardcode a
 * threshold — everything comes from here so the whole system can be tuned
 * (or A/B'd) in one place.
 *
 * There is no configurable revision count or overall-score gate here — the
 * pipeline now runs a fixed sequence (generate, deterministic fix, at most
 * one AI repair call) per the 2-Anthropic-call-per-request budget; see
 * lib/server/content-quality/engine.ts and qualityGate.ts.
 */

export const QUALITY_VERSION = "2.0.0";

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
