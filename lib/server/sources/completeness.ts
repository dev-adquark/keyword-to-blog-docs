import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { wordCount } from "../content-quality/textStats";

export interface CompletenessResult {
  passed: boolean;
  reason?: string;
}

const MIN_TOTAL_EVIDENCE_WORDS_MULTI_SOURCE = 80;
// A single source has no corroboration from another outlet, so it must
// carry meaningfully more of its own real detail to be trusted alone —
// this is not the same bar as the combined total for 2+ sources.
const MIN_EVIDENCE_WORDS_SINGLE_SOURCE = 150;

function evidenceWordCount(source: NormalizedSource): number {
  // Only real description/content text counts — provider metadata
  // (publisher name, category, language, etc.) is never evidence, and
  // locked/free-tier placeholder strings have already been normalized to
  // null by the provider adapters (see currents.ts/newsdata.ts/
  // newsapiOrg.ts), so they can never inflate this count either.
  return wordCount(source.description ?? "") + wordCount(source.content ?? "");
}

/**
 * Checks whether the approved (post freshness/relevance/quality/dedup/
 * conflict) source set actually contains enough real, usable material to
 * write from — answering "do we have enough trustworthy evidence", not
 * "did at least 2 providers respond". A single provider succeeding while
 * the others fail, time out, or return only locked/empty content must
 * still be able to pass here when that one source is genuinely
 * substantial — requiring a second provider's response was an artificial
 * bar this check never needed.
 */
export function evaluateCompleteness(approvedSources: NormalizedSource[]): CompletenessResult {
  if (approvedSources.length === 0) {
    return { passed: false, reason: "no approved sources — no evidence to generate from" };
  }

  const totalWords = approvedSources.reduce((sum, s) => sum + evidenceWordCount(s), 0);

  if (approvedSources.length === 1) {
    if (totalWords < MIN_EVIDENCE_WORDS_SINGLE_SOURCE) {
      return {
        passed: false,
        reason: `only 1 approved source with ${totalWords} words of real evidence — a single, uncorroborated source needs at least ${MIN_EVIDENCE_WORDS_SINGLE_SOURCE} words to be trusted alone`,
      };
    }
    return { passed: true };
  }

  if (totalWords < MIN_TOTAL_EVIDENCE_WORDS_MULTI_SOURCE) {
    return {
      passed: false,
      reason: `only ${totalWords} words of real evidence across ${approvedSources.length} approved sources, need at least ${MIN_TOTAL_EVIDENCE_WORDS_MULTI_SOURCE}`,
    };
  }

  return { passed: true };
}
