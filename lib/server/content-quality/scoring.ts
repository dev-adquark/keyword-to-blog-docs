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
import type { EvidenceClaimsResult } from "./evidenceClaims";
import type { NoPublishedLinksResult } from "./noPublishedLinks";
import type { SourceOriginalityResult } from "./sourceOriginality";

export interface ValidatorOutputs {
  writing: WritingQualityResult;
  originality: OriginalityResult;
  /** Optional — only present for source-grounded generation (see
   * sourceGroundedPipeline.ts), since it requires the real SourcePack to
   * compare the article against. Folded into the originality score, since
   * "copied too closely from the source material" is fundamentally an
   * originality concern, just measured against external text instead of
   * internal duplication (see sourceOriginality.ts). */
  sourceOriginality?: SourceOriginalityResult;
  depth: DepthResult;
  seo: SeoQualityResult;
  readability: ReadabilityResult;
  keyword: KeywordQualityResult;
  structure: StructureResult;
  spam: SpamDetectionResult;
  factuality: FactualityResult;
  freshness: FreshnessResult;
  /** Fabricated/unsupported-precision claims — folded into the writing
   * score since asserting unverifiable specifics is a writing-integrity
   * concern, not a separate report category (see evidenceClaims.ts). */
  evidence: EvidenceClaimsResult;
  /** A source link/URL/citation or "Sources" section that somehow survived
   * the unconditional deterministic strip in postRender.ts — folded into
   * the structure score, since a rogue Sources section or stray link is a
   * structural content-shape defect. Always empty in normal operation; see
   * noPublishedLinks.ts. */
  noPublishedLinks: NoPublishedLinksResult;
}

/** Builds a report without deciding pass/fail — see qualityGate.ts for that.
 * Scores are purely deterministic (no LLM blending) — every category score
 * is fully attributable to actual failedChecks from real validators, which
 * is what makes the qualityGate's "only blocking failedChecks can fail"
 * rule coherent (see qualityGate.ts's bug-fix comment). */
export function buildQualityReport(params: {
  wordCount: number;
  keywordCoverage: number;
  revisionCount: number;
  outputs: ValidatorOutputs;
}): Omit<ContentQualityReport, "overallStatus"> {
  const { outputs } = params;

  const writingScore = Math.round((outputs.writing.score + outputs.evidence.score) / 2);
  const originalityScore = outputs.sourceOriginality
    ? Math.round((outputs.originality.score + outputs.sourceOriginality.score) / 2)
    : outputs.originality.score;
  const depthScore = outputs.depth.score;
  const seoScore = Math.round((outputs.seo.score + outputs.spam.score) / 2);
  const readabilityScore = outputs.readability.score;
  const keywordScore = outputs.keyword.score;
  const structureScore = Math.round((outputs.structure.score + outputs.noPublishedLinks.score) / 2);

  const categoryScores = [writingScore, originalityScore, depthScore, seoScore, readabilityScore, keywordScore, structureScore];
  const overallScore = Math.round(categoryScores.reduce((a, b) => a + b, 0) / categoryScores.length);

  const allFailedChecks: FailedCheck[] = [
    ...outputs.writing.failedChecks,
    ...outputs.evidence.failedChecks,
    ...outputs.originality.failedChecks,
    ...(outputs.sourceOriginality?.failedChecks ?? []),
    ...outputs.depth.failedChecks,
    ...outputs.seo.failedChecks,
    ...outputs.readability.failedChecks,
    ...outputs.keyword.failedChecks,
    ...outputs.structure.failedChecks,
    ...outputs.noPublishedLinks.failedChecks,
    ...outputs.spam.failedChecks,
    ...outputs.factuality.failedChecks,
    ...outputs.freshness.failedChecks,
  ];

  const warnings: string[] = [
    ...outputs.writing.warnings,
    ...outputs.evidence.warnings,
    ...outputs.originality.warnings,
    ...(outputs.sourceOriginality?.warnings ?? []),
    ...outputs.depth.warnings,
    ...outputs.seo.warnings,
    ...outputs.readability.warnings,
    ...outputs.keyword.warnings,
    ...outputs.structure.warnings,
    ...outputs.noPublishedLinks.warnings,
    ...outputs.spam.warnings,
    ...outputs.factuality.warnings,
    ...outputs.freshness.warnings,
  ];

  const categories: Array<{ name: string; failedChecks: FailedCheck[] }> = [
    { name: "writing", failedChecks: [...outputs.writing.failedChecks, ...outputs.evidence.failedChecks] },
    { name: "originality", failedChecks: [...outputs.originality.failedChecks, ...(outputs.sourceOriginality?.failedChecks ?? [])] },
    { name: "depth", failedChecks: outputs.depth.failedChecks },
    { name: "seo", failedChecks: [...outputs.seo.failedChecks, ...outputs.spam.failedChecks] },
    { name: "readability", failedChecks: outputs.readability.failedChecks },
    { name: "keyword", failedChecks: outputs.keyword.failedChecks },
    { name: "structure", failedChecks: [...outputs.structure.failedChecks, ...outputs.noPublishedLinks.failedChecks] },
  ];
  const passedChecks = categories
    .filter((c) => c.failedChecks.filter((f) => f.severity === "blocking").length === 0)
    .map((c) => c.name);

  return {
    qualityVersion: QUALITY_VERSION,
    overallScore,
    writingScore,
    originalityScore,
    depthScore,
    seoScore,
    readabilityScore,
    keywordScore,
    structureScore,
    factualityStatus: outputs.factuality.status,
    freshnessStatus: outputs.freshness.status,
    wordCount: params.wordCount,
    keywordCoverage: params.keywordCoverage,
    revisionCount: params.revisionCount,
    passedChecks,
    failedChecks: allFailedChecks,
    warnings,
    revisionReasons: allFailedChecks.filter((f) => f.severity === "blocking").map((f) => f.message),
  };
}
