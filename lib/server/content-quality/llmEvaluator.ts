import "server-only";
import type { ContentBrief, SEOPostV1 } from "@/lib/types";
import { evaluateContentQuality } from "../generation/anthropic";

export interface LLMEvaluatorResult {
  available: boolean;
  usefulnessScore: number | null;
  depthScore: number | null;
  searchIntentMatchScore: number | null;
  naturalWritingScore: number | null;
  originalityOfIdeasScore: number | null;
  factualPlausibilityScore: number | null;
  concerns: string[];
}

/**
 * Thin wrapper over the real second Anthropic call — degrades gracefully
 * (available: false, null scores) on any failure rather than blocking the
 * pipeline. Deterministic validators are the authoritative safety net;
 * this is a supplementary signal only (see scoring.ts).
 */
export async function runLLMEvaluator(post: SEOPostV1, brief: ContentBrief): Promise<LLMEvaluatorResult> {
  const evaluation = await evaluateContentQuality(post, brief);
  if (!evaluation) {
    return {
      available: false,
      usefulnessScore: null,
      depthScore: null,
      searchIntentMatchScore: null,
      naturalWritingScore: null,
      originalityOfIdeasScore: null,
      factualPlausibilityScore: null,
      concerns: [],
    };
  }
  return {
    available: true,
    usefulnessScore: evaluation.usefulnessScore,
    depthScore: evaluation.depthScore,
    searchIntentMatchScore: evaluation.searchIntentMatchScore,
    naturalWritingScore: evaluation.naturalWritingScore,
    originalityOfIdeasScore: evaluation.originalityOfIdeasScore,
    factualPlausibilityScore: evaluation.factualPlausibilityScore,
    concerns: evaluation.concerns,
  };
}
