import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { wordCount } from "../content-quality/textStats";

export interface CompletenessResult {
  passed: boolean;
  reason?: string;
}

const MIN_APPROVED_SOURCES = 1;
const MIN_TOTAL_EVIDENCE_WORDS = 50;

/** Checks whether the approved (post freshness/relevance/quality/dedup/
 * conflict) source set actually contains enough real material to write
 * from — not just "did some sources pass the earlier gates". */
export function evaluateCompleteness(approvedSources: NormalizedSource[]): CompletenessResult {
  if (approvedSources.length < MIN_APPROVED_SOURCES) {
    return {
      passed: false,
      reason: `only ${approvedSources.length} approved source(s), need at least ${MIN_APPROVED_SOURCES} for sufficient evidence diversity`,
    };
  }

  const totalWords = approvedSources.reduce(
    (sum, s) => sum + wordCount(s.description ?? "") + wordCount(s.content ?? ""),
    0
  );
  if (totalWords < MIN_TOTAL_EVIDENCE_WORDS) {
    return {
      passed: false,
      reason: `only ${totalWords} words of real evidence across approved sources, need at least ${MIN_TOTAL_EVIDENCE_WORDS}`,
    };
  }

  return { passed: true };
}
