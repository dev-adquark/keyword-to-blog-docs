import "server-only";
import type { ContentQualityReport, ContentQualitySummary, GenerateRequestV1, SEOPostV1 } from "@/lib/types";
import { getAIProvider } from "../generation/anthropic";
import type { AIProvider } from "../generation/provider";
import { enforceSectionConstraint, countWords, assertWordCountWithinTolerance } from "../postRender";
import { ApiError } from "../apiErrors";
import { buildContentBrief } from "./contentBrief";
import { buildSeoPlan } from "./seoPlan";
import { evaluateWritingQuality } from "./writingQuality";
import { evaluateOriginality } from "./originality";
import { evaluateDepth } from "./depth";
import { evaluateSeoQuality } from "./seoQuality";
import { evaluateReadability } from "./readability";
import { evaluateKeywordQuality } from "./keywordQuality";
import { evaluateStructure } from "./structure";
import { evaluateSpamSignals } from "./spamDetection";
import { evaluateFactuality } from "./factuality";
import { evaluateFreshness } from "./freshness";
import { evaluateEvidenceClaims } from "./evidenceClaims";
import { buildQualityReport } from "./scoring";
import { decideQualityGate } from "./qualityGate";
import { applyDeterministicFixes } from "./autoFix";
import { applyRepairPatch } from "./repairPatch";

export interface QualityPipelineResult {
  post: SEOPostV1;
  report: ContentQualityReport;
}

/**
 * Carries the FULL internal report (for DB persistence / logging) alongside
 * a deliberately minimal public `details` payload — the public API response
 * only ever sees stable, machine-readable failedCheck codes, never full
 * internal scores/messages (see "do not expose internal scoring
 * implementation unnecessarily").
 */
export class ContentQualityFailedError extends ApiError {
  report: ContentQualityReport;

  constructor(report: ContentQualityReport) {
    super(
      "CONTENT_QUALITY_FAILED",
      "Generated content did not meet the required quality standard after automatic correction.",
      {
        revisionCount: report.revisionCount,
        overallScore: report.overallScore,
        failedCheckCodes: [...new Set(report.failedChecks.filter((f) => f.severity === "blocking").map((f) => f.code))],
      }
    );
    this.report = report;
  }
}

/**
 * FACTUALITY_UNVERIFIED / FRESHNESS_UNVERIFIED (blocking) mean the request
 * needs source verification this deployment cannot perform — no amount of
 * mechanical fixing or AI repair grants that capability, so the one repair
 * call is never spent chasing an unfixable capability gap.
 */
function isUnfixableByRepair(report: Omit<ContentQualityReport, "overallStatus">): boolean {
  return report.failedChecks.some(
    (f) => f.severity === "blocking" && (f.code === "FACTUALITY_UNVERIFIED" || f.code === "FRESHNESS_UNVERIFIED")
  );
}

/** Runs every deterministic validator and folds the results into one report. */
async function validate(
  request: GenerateRequestV1,
  post: SEOPostV1,
  revisionCount: number
): Promise<Omit<ContentQualityReport, "overallStatus">> {
  const brief = buildContentBrief(request);

  const writing = evaluateWritingQuality(post, request.language);
  const originality = evaluateOriginality(post);
  const depth = evaluateDepth(post, brief);
  const seo = evaluateSeoQuality(post, brief);
  const readability = evaluateReadability(post, brief);
  const keyword = evaluateKeywordQuality(post, brief);
  const structure = evaluateStructure(post);
  const spam = evaluateSpamSignals(post, brief, request.language);
  const factuality = evaluateFactuality(request);
  const freshness = evaluateFreshness(request, post);
  const evidence = evaluateEvidenceClaims(request, post);

  return buildQualityReport({
    wordCount: countWords(post),
    keywordCoverage: keyword.keywordCoverage,
    revisionCount,
    outputs: { writing, originality, depth, seo, readability, keyword, structure, spam, factuality, freshness, evidence },
  });
}

function finalizePost(post: SEOPostV1, request: GenerateRequestV1): SEOPostV1 {
  const constrained = enforceSectionConstraint(post, request.constraints);
  assertWordCountWithinTolerance(countWords(constrained), request.constraints);
  return constrained;
}

function withStatus(report: Omit<ContentQualityReport, "overallStatus">): ContentQualityReport {
  return { ...report, overallStatus: decideQualityGate(report) };
}

/**
 * generate → validate → (free) deterministic fix → validate → (at most ONE)
 * targeted AI repair → validate → return. Maximum 2 Anthropic calls total
 * per request (generate + repair) — never a third, and the repair call is
 * a minimal patch, never a full re-generation.
 *
 * CONTENT_QUALITY_FAILED is thrown only when: a capability gap makes the
 * request unfixable by design (factualityMode: "verified" — see
 * isUnfixableByRepair), or blocking failures remain after both the
 * deterministic pass and the one repair call. A report with zero blocking
 * failedChecks always passes, regardless of its overall/category scores —
 * see qualityGate.ts's bug-fix comment for why that specifically matters.
 */
export async function runContentQualityPipeline(
  request: GenerateRequestV1,
  provider: AIProvider = getAIProvider()
): Promise<QualityPipelineResult> {
  const brief = buildContentBrief(request);
  const plan = buildSeoPlan(request, brief);

  // Anthropic call 1 of at most 2.
  let post = finalizePost(await provider.generate(request, { brief, plan }), request);
  let report = withStatus(await validate(request, post, 0));

  if (report.overallStatus === "PASS") return { post, report };
  if (isUnfixableByRepair(report)) throw new ContentQualityFailedError(report);

  // Deterministic/local fixes — free, no AI call, applied for every
  // matching mechanical issue regardless of severity (cosmetic problems are
  // free to clean up too, not just blocking ones).
  const mechanicalFix = applyDeterministicFixes(post, report.failedChecks, brief);
  if (mechanicalFix.appliedFixes.length > 0) {
    post = finalizePost(mechanicalFix.post, request);
    report = withStatus(await validate(request, post, 0));
    if (report.overallStatus === "PASS") return { post, report };
    if (isUnfixableByRepair(report)) throw new ContentQualityFailedError(report);
  }

  // Anthropic call 2 of at most 2 — ONE targeted repair for whatever is
  // still blocking (semantic writing/depth/originality/keyword issues that
  // mechanical fixes genuinely can't rewrite prose for).
  const blockingFailures = report.failedChecks.filter((f) => f.severity === "blocking");
  const patch = await provider.repair({ request, post, failedChecks: blockingFailures, context: { brief, plan } });
  post = finalizePost(applyRepairPatch(post, patch), request);
  report = withStatus(await validate(request, post, 1));

  // One more free mechanical pass to mop up anything cosmetic the repair
  // call left behind or introduced — the "safest available fallback
  // correction" step — before finally deciding. Costs nothing (no AI call).
  const finalMechanicalFix = applyDeterministicFixes(post, report.failedChecks, brief);
  if (finalMechanicalFix.appliedFixes.length > 0) {
    post = finalizePost(finalMechanicalFix.post, request);
    report = withStatus(await validate(request, post, 1));
  }

  if (report.overallStatus === "PASS") return { post, report };
  throw new ContentQualityFailedError(report);
}

export function toQualitySummary(report: ContentQualityReport): ContentQualitySummary {
  return {
    status: "pass",
    score: report.overallScore,
    revisionCount: report.revisionCount,
    qualityVersion: report.qualityVersion,
  };
}
