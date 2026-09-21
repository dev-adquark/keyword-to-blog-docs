import "server-only";
import type { ContentQualityReport, FreshnessStatus, GenerateRequestV1, SEOPostV1, SourceRetrievalReport } from "@/lib/types";
import { ApiError } from "../apiErrors";
import { retrieveValidatedSourcePack } from "../sources/retrieve";
import { rewriteFromSourcePack } from "../generation/rewriter";
import { enforceSectionConstraint, countWords, assertWordCountWithinTolerance } from "../postRender";
import { buildContentBrief } from "./contentBrief";
import { evaluateWritingQuality } from "./writingQuality";
import { evaluateOriginality } from "./originality";
import { evaluateDepth } from "./depth";
import { evaluateSeoQuality } from "./seoQuality";
import { evaluateReadability } from "./readability";
import { evaluateKeywordQuality } from "./keywordQuality";
import { evaluateStructure } from "./structure";
import { evaluateSpamSignals } from "./spamDetection";
import { evaluateFactuality } from "./factuality";
import { evaluateEvidenceClaims } from "./evidenceClaims";
import { evaluateCitationIntegrity } from "./citationIntegrity";
import { buildQualityReport } from "./scoring";
import { decideQualityGate } from "./qualityGate";
import { applyDeterministicFixes } from "./autoFix";
import { ContentQualityFailedError, type QualityPipelineResult } from "./pipelineResult";

/**
 * Thrown when up to 3 source-retrieval attempts all fail to produce a
 * source pack that passes freshness/relevance/quality/dedup/completeness/
 * conflict validation. Anthropic is never called in this case — see
 * REQUIREMENTS "Hard Anthropic gate" / "Anthropic calls = 0".
 */
export class SourceValidationFailedError extends ApiError {
  report: SourceRetrievalReport;

  constructor(report: SourceRetrievalReport) {
    super(
      "SOURCE_VALIDATION_FAILED",
      "No sufficient, fresh, relevant, and verifiable source material could be found for this topic after 3 retrieval attempts. Anthropic was not called.",
      {
        attempts: report.attempts.length,
        freshnessPolicy: report.freshnessPolicy,
        lastAttemptFailureReasons: report.sourcePack?.failureReasons ?? [],
      }
    );
    this.report = report;
  }
}

function finalizePost(post: SEOPostV1, request: GenerateRequestV1): SEOPostV1 {
  const constrained = enforceSectionConstraint(post, request.constraints);
  assertWordCountWithinTolerance(countWords(constrained), request.constraints);
  return constrained;
}

function withStatus(report: Omit<ContentQualityReport, "overallStatus">): ContentQualityReport {
  return { ...report, overallStatus: decideQualityGate(report) };
}

/** Runs every deterministic validator against the rewritten post, folding
 * citation-integrity (the one freshness check that matters here — does
 * every cited source trace back to the locked pack) in as the report's
 * `freshness` category. */
function validateSourceGrounded(
  request: GenerateRequestV1,
  post: SEOPostV1,
  pack: import("@/lib/types").SourcePack
): ContentQualityReport {
  const brief = buildContentBrief(request);
  const citation = evaluateCitationIntegrity(post, pack);

  const writing = evaluateWritingQuality(post, request.language);
  const originality = evaluateOriginality(post);
  const depth = evaluateDepth(post, brief);
  const seo = evaluateSeoQuality(post, brief);
  const readability = evaluateReadability(post, brief);
  const keyword = evaluateKeywordQuality(post, brief);
  const structure = evaluateStructure(post);
  const spam = evaluateSpamSignals(post, brief, request.language);
  const factuality = evaluateFactuality(request);
  const evidence = evaluateEvidenceClaims(request, post);

  const freshnessStatus: FreshnessStatus = citation.failedChecks.length === 0 ? "VERIFIED_CURRENT" : "UNVERIFIED_BLOCKED";
  const freshness = { status: freshnessStatus, failedChecks: citation.failedChecks, warnings: citation.warnings };

  return withStatus(
    buildQualityReport({
      wordCount: countWords(post),
      keywordCoverage: keyword.keywordCoverage,
      revisionCount: 0,
      outputs: { writing, originality, depth, seo, readability, keyword, structure, spam, factuality, freshness, evidence },
    })
  );
}

/**
 * RETRIEVE → NORMALIZE → DEDUPLICATE → validate (freshness/relevance/
 * quality/completeness/conflict) → SOURCE PACK LOCK → ONE Anthropic rewrite
 * → deterministic final validation → publish or fail. No repair call, no
 * second rewrite, no evaluator call — see REQUIREMENTS "Single Anthropic
 * call" / "Post-rewrite behavior". A free, local mechanical cleanup pass
 * (no AI call) may still run once, exactly like the evergreen pipeline's
 * cosmetic fixes.
 */
export async function runSourceGroundedPipeline(
  request: GenerateRequestV1,
  requestId: string
): Promise<QualityPipelineResult> {
  const retrieval = await retrieveValidatedSourcePack({
    requestId,
    topic: request.topic ?? request.keywords[0] ?? "",
    keywords: request.keywords,
    freshnessPolicy: "TODAY_ONLY",
    language: request.language,
    country: request.region,
  });

  if (retrieval.finalStatus !== "PASS" || !retrieval.sourcePack) {
    throw new SourceValidationFailedError(retrieval);
  }
  const pack = retrieval.sourcePack;

  // The one and only Anthropic call for this request.
  const rewritten = await rewriteFromSourcePack(request, pack);
  let post = finalizePost(rewritten, request);
  let report = validateSourceGrounded(request, post, pack);

  // Free, local mechanical cleanup — always attempted once (there is no
  // repair loop in this pipeline to place it after), never a second
  // Anthropic call. Runs regardless of whether the gate already passed,
  // since a purely cosmetic/warning-level issue (e.g. a stray year in the
  // title) doesn't fail the gate but is still free to clean up.
  const brief = buildContentBrief(request);
  const mechanicalFix = applyDeterministicFixes(post, report.failedChecks, brief);
  if (mechanicalFix.appliedFixes.length > 0) {
    post = finalizePost(mechanicalFix.post, request);
    report = validateSourceGrounded(request, post, pack);
  }

  if (report.overallStatus === "PASS") return { post, report };
  throw new ContentQualityFailedError(report);
}
