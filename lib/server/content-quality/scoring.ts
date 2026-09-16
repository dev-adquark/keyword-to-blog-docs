import "server-only";
import type { ContentQualityReport, FailedCheck } from "@/lib/types";
import { QUALITY_VERSION } from "./config";
import type { WritingQualityResult } from "./writingQuality";
import type { OriginalityResult } from "./originality";
import type { DepthResult } from "./depth";
import type { SeoQualityResult } from "./seoQuality";
import type { ReadabilityResult } from "./readability";
import type { KeywordQualityResult } from "./keywordQuality";
import type { StructureResult } from "./structure";
import type { SpamDetectionResult } from "./spamDetection";
import type { FactualityResult } from "./factuality";
import type { FreshnessResult } from "./freshness";
import type { LLMEvaluatorResult } from "./llmEvaluator";

export interface ValidatorOutputs {
  writing: WritingQualityResult;
  originality: OriginalityResult;
  depth: DepthResult;
  seo: SeoQualityResult;
  readability: ReadabilityResult;
  keyword: KeywordQualityResult;
  structure: StructureResult;
  spam: SpamDetectionResult;
  factuality: FactualityResult;
  freshness: FreshnessResult;
  llm: LLMEvaluatorResult;
}

/** Blends a deterministic score with the LLM evaluator's corresponding
 * signal when available — the deterministic score is never fully replaced,
 * only nudged, per "never depend entirely on the LLM evaluator". */
function blend(deterministic: number, llmScore: number | null, llmWeight = 0.35): number {
  if (llmScore === null) return deterministic;
  return deterministic * (1 - llmWeight) + llmScore * llmWeight;
}

/** Builds a report without deciding pass/fail — see qualityGate.ts for that. */
export function buildQualityReport(params: {
  wordCount: number;
  keywordCoverage: number;
  revisionCount: number;
  outputs: ValidatorOutputs;
}): Omit<ContentQualityReport, "overallStatus"> {
  const { outputs } = params;

  const writingScore = blend(outputs.writing.score, outputs.llm.naturalWritingScore);
  const originalityScore = blend(outputs.originality.score, outputs.llm.originalityOfIdeasScore);
  const depthScore = blend(outputs.depth.score, outputs.llm.depthScore);
  const seoScore = blend(
    (outputs.seo.score + outputs.spam.score) / 2,
    outputs.llm.searchIntentMatchScore
  );
  const readabilityScore = outputs.readability.score;
  const keywordScore = outputs.keyword.score;
  const structureScore = outputs.structure.score;

  const categoryScores = [writingScore, originalityScore, depthScore, seoScore, readabilityScore, keywordScore, structureScore];
  const overallScore = Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length);

  const allFailedChecks: FailedCheck[] = [
    ...outputs.writing.failedChecks,
    ...outputs.originality.failedChecks,
    ...outputs.depth.failedChecks,
    ...outputs.seo.failedChecks,
    ...outputs.readability.failedChecks,
    ...outputs.keyword.failedChecks,
    ...outputs.structure.failedChecks,
    ...outputs.spam.failedChecks,
    ...outputs.factuality.failedChecks,
    ...outputs.freshness.failedChecks,
  ];

  const warnings: string[] = [
    ...outputs.writing.warnings,
    ...outputs.originality.warnings,
    ...outputs.depth.warnings,
    ...outputs.seo.warnings,
    ...outputs.readability.warnings,
    ...outputs.keyword.warnings,
    ...outputs.structure.warnings,
    ...outputs.spam.warnings,
    ...outputs.factuality.warnings,
    ...outputs.freshness.warnings,
  ];

  if (!outputs.llm.available) {
    warnings.push("LLM quality evaluator was unavailable for this attempt — scoring relied on deterministic checks only.");
  } else if (outputs.llm.concerns.length > 0) {
    warnings.push(...outputs.llm.concerns.map((c) => `LLM evaluator concern: ${c}`));
  }

  const categories: Array<{ name: string; failedChecks: FailedCheck[] }> = [
    { name: "writing", failedChecks: outputs.writing.failedChecks },
    { name: "originality", failedChecks: outputs.originality.failedChecks },
    { name: "depth", failedChecks: outputs.depth.failedChecks },
    { name: "seo", failedChecks: [...outputs.seo.failedChecks, ...outputs.spam.failedChecks] },
    { name: "readability", failedChecks: outputs.readability.failedChecks },
    { name: "keyword", failedChecks: outputs.keyword.failedChecks },
    { name: "structure", failedChecks: outputs.structure.failedChecks },
  ];
  const passedChecks = categories
    .filter((c) => c.failedChecks.filter((f) => f.severity === "blocking").length === 0)
    .map((c) => c.name);

  return {
    qualityVersion: QUALITY_VERSION,
    overallScore,
    writingScore: Math.round(writingScore),
    originalityScore: Math.round(originalityScore),
    depthScore: Math.round(depthScore),
    seoScore: Math.round(seoScore),
    readabilityScore: Math.round(readabilityScore),
    keywordScore: Math.round(keywordScore),
    structureScore: Math.round(structureScore),
    factualityStatus: outputs.factuality.status,
    freshnessStatus: outputs.freshness.status,
    wordCount: params.wordCount,
    keywordCoverage: params.keywordCoverage,
    revisionCount: params.revisionCount,
    passedChecks,
    failedChecks: allFailedChecks,
    warnings,
    revisionReasons: allFailedChecks.filter((f) => f.severity === "blocking").map((f) => f.message),
    llmEvaluatorAvailable: outputs.llm.available,
  };
}
