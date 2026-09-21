import "server-only";
import type { ConflictedClaim, EvidenceClaim, NormalizedSource } from "@/lib/types";
import { significantTermSimilarity } from "./textSimilarity";

// Stopword-filtered similarity (not raw Jaccard, which counts "the",
// "today", "market" etc. as matching content) — a raw-word comparison was
// clustering, and then sometimes conflict-excluding, genuinely unrelated
// stories that merely shared common topic/filler vocabulary (e.g. two
// distinct stock-market stories that both happen to say "stock market
// today"). Requiring real, specific-term overlap avoids that false rejection
// while still reliably clustering genuine same-story coverage, which tends
// to share several specific proper nouns/numbers, not just broad topic words.
const SAME_STORY_TITLE_THRESHOLD = 0.3;

/**
 * Pragmatic, deterministic claim/evidence mapping — this deployment has no
 * NLP claim-extraction model, so a "claim" here is approximated as one
 * story cluster (sources whose titles are similar enough to plausibly cover
 * the same underlying event), and its representative text is the clearest
 * member's title. This is intentionally a coarse, explainable heuristic —
 * not a claim of true semantic understanding — but it is enough to do the
 * two things that matter: (1) know which sources corroborate the same
 * story, and (2) catch the case where sources covering the same story
 * report contradicting figures, without ever asking Anthropic to resolve
 * the disagreement.
 */
export function buildEvidenceMap(sources: NormalizedSource[]): {
  approvedClaims: EvidenceClaim[];
  excludedClaims: ConflictedClaim[];
} {
  const clusters: NormalizedSource[][] = [];
  for (const source of sources) {
    const cluster = clusters.find((c) => significantTermSimilarity(c[0]!.title, source.title) >= SAME_STORY_TITLE_THRESHOLD);
    if (cluster) cluster.push(source);
    else clusters.push([source]);
  }

  const approvedClaims: EvidenceClaim[] = [];
  const excludedClaims: ConflictedClaim[] = [];

  for (const cluster of clusters) {
    const representative = cluster[0]!;
    const supportedBy = cluster.map((s) => s.sourceId);

    if (cluster.length === 1) {
      approvedClaims.push({ claim: representative.title, supportedBy });
      continue;
    }

    if (hasDisjointNumericClaims(cluster)) {
      excludedClaims.push({
        topic: representative.title,
        reason: "multiple sources appear to cover the same story but report non-overlapping figures/dates — excluded rather than guessed",
        conflictingSourceIds: supportedBy,
      });
      continue;
    }

    approvedClaims.push({ claim: representative.title, supportedBy });
  }

  return { approvedClaims, excludedClaims };
}

const NUMBER_PATTERN = /\b\d[\d,]*(?:\.\d+)?%?\b/g;

function extractNumbers(source: NormalizedSource): Set<string> {
  const text = `${source.title} ${source.description ?? ""}`;
  return new Set([...text.matchAll(NUMBER_PATTERN)].map((m) => m[0]));
}

/** Conservative conflict signal: only flags a cluster when at least two
 * members each cite real, non-overlapping numeric/date figures for what
 * looks like the same story — a cluster where nobody cites a number, or
 * where numbers simply agree, is never flagged. This deliberately favors
 * missing a real conflict over falsely blocking well-corroborated content. */
function hasDisjointNumericClaims(cluster: NormalizedSource[]): boolean {
  const numberSets = cluster.map(extractNumbers).filter((set) => set.size > 0);
  if (numberSets.length < 2) return false;
  return numberSets.every((set, i) =>
    numberSets.every((other, j) => i === j || [...set].every((n) => !other.has(n)))
  );
}
