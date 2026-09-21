import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { tokenizeWords } from "../content-quality/textStats";

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for",
  "with", "about", "as", "by", "is", "are", "was", "were", "be", "been",
  "this", "that", "these", "those", "it", "its", "from", "into", "over",
  "how", "what", "when", "why", "your", "you", "will", "can", "new", "latest",
]);

/** Keeps model numbers / short alphanumeric identifiers ("18", "5g", "4k")
 * that a plain length filter would otherwise drop — those are often the
 * most discriminating term in a topic ("iPhone 18" vs. any other iPhone). */
function significantTerms(...texts: Array<string | undefined>): string[] {
  const words = texts
    .filter((t): t is string => Boolean(t))
    .flatMap((t) => tokenizeWords(t))
    .filter((w) => (w.length > 2 || /\d/.test(w)) && !STOPWORDS.has(w));
  return [...new Set(words)];
}

export interface RelevanceResult {
  relevant: boolean;
  score: number;
  reason?: string;
}

/**
 * Deterministic relevance check — no embeddings/semantic model available in
 * this deployment, so relevance is judged by real term overlap rather than
 * a single incidental keyword match, and never by requiring the whole
 * topic/keyword string to appear verbatim (a real headline paraphrases the
 * request — "Apple unveils iPhone 18" for a request about "Apple iPhone 18
 * launch" — so a literal-substring check would reject almost everything).
 *
 * A source only qualifies if EVERY significant word from the primary
 * keyword/topic phrase is present somewhere in its text AND at least half
 * of all other significant terms from the full request are present — this
 * is what rejects, e.g., a general smartphone-market article for a request
 * about "Apple iPhone 18 launch" just because it contains the word "Apple".
 */
export function evaluateRelevance(source: NormalizedSource, keywords: string[], topic?: string): RelevanceResult {
  const haystack = [source.title, source.description, source.content]
    .filter((v): v is string => Boolean(v))
    .join(" ")
    .toLowerCase();

  const primaryPhrase = keywords[0] ?? topic;
  const primaryTerms = significantTerms(primaryPhrase);
  const allTerms = significantTerms(topic, ...keywords);

  if (allTerms.length === 0) {
    return { relevant: true, score: 1 };
  }

  const missingPrimaryTerms = primaryTerms.filter((t) => !haystack.includes(t));
  const primaryMatched = missingPrimaryTerms.length === 0;

  const matchedTerms = allTerms.filter((t) => haystack.includes(t));
  const score = matchedTerms.length / allTerms.length;

  const relevant = primaryMatched && score >= 0.5;
  return {
    relevant,
    score,
    reason: relevant
      ? undefined
      : !primaryMatched
        ? `missing primary term(s) from the request: ${missingPrimaryTerms.join(", ")}`
        : `only matched ${matchedTerms.length}/${allTerms.length} significant terms from the request`,
  };
}
