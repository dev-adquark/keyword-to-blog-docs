import "server-only";
import { tokenizeWords } from "../content-quality/textStats";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "about", "as", "by", "is", "are", "was", "were", "be", "been",
  "this", "that", "these", "those", "it", "its", "from", "into", "over",
  "how", "what", "when", "why", "your", "you", "will", "can", "new", "latest",
  "today", "says", "said",
]);

/** Keeps model numbers / short alphanumeric identifiers ("18", "5g", "4k")
 * that a plain length filter would otherwise drop — those are often the
 * most discriminating term in a topic ("iPhone 18" vs. any other iPhone). */
export function significantTerms(...texts: Array<string | undefined>): string[] {
  const words = texts
    .filter((t): t is string => Boolean(t))
    .flatMap((t) => tokenizeWords(t))
    .filter((w) => (w.length > 2 || /\d/.test(w)) && !STOPWORDS.has(w));
  return [...new Set(words)];
}

/**
 * Jaccard similarity over STOPWORD-FILTERED significant terms only — unlike
 * a raw word-set Jaccard (which counts "the"/"today"/"market" etc. as
 * matching content), this avoids two genuinely unrelated headlines being
 * judged similar just because they share common topic/filler words. Used
 * for clustering "do these sources cover the same underlying story"
 * (see ./evidence.ts) — a raw Jaccard here was clustering (and then
 * sometimes conflict-excluding) unrelated stories that merely shared a
 * broad topic vocabulary.
 */
export function significantTermSimilarity(a: string, b: string): number {
  const setA = new Set(significantTerms(a));
  const setB = new Set(significantTerms(b));
  if (setA.size === 0 && setB.size === 0) return 0; // no real signal either way — never treat as "same story"
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
