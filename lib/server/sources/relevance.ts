import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { significantTerms } from "./textSimilarity";

export interface RelevanceResult {
  relevant: boolean;
  score: number;
  reason?: string;
}

/** Tolerates a trivial singular/plural mismatch ("vehicle" vs. "vehicles")
 * so a genuinely relevant article isn't rejected purely over grammatical
 * number — this was rejecting real, on-topic coverage that phrased a
 * keyword in its other form. Still requires the real word to appear;
 * this is not stemming, just the one common, low-risk variant. */
function haystackContainsTerm(haystack: string, term: string): boolean {
  if (haystack.includes(term)) return true;
  if (term.endsWith("s") && term.length > 3) return haystack.includes(term.slice(0, -1));
  return haystack.includes(`${term}s`);
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
 * keyword/topic phrase is present somewhere in its text (tolerating simple
 * plural/singular variation) AND at least half of all other significant
 * terms from the full request are present — this is what rejects, e.g., a
 * general smartphone-market article for a request about "Apple iPhone 18
 * launch" just because it contains the word "Apple", while still accepting
 * a genuinely on-topic article that happens to phrase a keyword differently.
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

  const missingPrimaryTerms = primaryTerms.filter((t) => !haystackContainsTerm(haystack, t));
  const primaryMatched = missingPrimaryTerms.length === 0;

  const matchedTerms = allTerms.filter((t) => haystackContainsTerm(haystack, t));
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
