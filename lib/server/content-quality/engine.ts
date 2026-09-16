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
import { runLLMEvaluator, type LLMEvaluatorResult } from "./llmEvaluator";
import { buildQualityReport } from "./scoring";
import { decideQualityGate } from "./qualityGate";
import { buildRevisionFeedback } from "./revision";
import { getMaxRevisions } from "./config";

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
      "Generated content did not meet the required quality standard after automatic revision.",
      {
        revisionCount: report.revisionCount,
        overallScore: report.overallScore,
        failedCheckCodes: [...new Set(report.failedChecks.filter((f) => f.severity === "blocking").map((f) => f.code))],
      }
    );
    this.report = report;
  }
}

const UNAVAILABLE_LLM_RESULT: LLMEvaluatorResult = {
  available: false,
  usefulnessScore: null,
  depthScore: null,
  searchIntentMatchScore: null,
  naturalWritingScore: null,
  originalityOfIdeasScore: null,
  factualPlausibilityScore: null,
  concerns: [],
};

/**
 * Runs every deterministic validator, then (unless the structure is already
 * broken beyond usefulness) the supplementary LLM evaluator, and folds the
 * results into one report. Deterministic checks first, cheap, always run;
 * the LLM call is skipped when it would be evaluating unusable output — see
 * "avoid unnecessary model calls" in the pipeline's performance principles.
 */
async function validate(
  request: GenerateRequestV1,
  post: SEOPostV1,
  revisionCount: number
): Promise<Omit<ContentQualityReport, "overallStatus">> {
  const brief = buildContentBrief(request);

  const structure = evaluateStructure(post);
  const hasBrokenStructure = structure.failedChecks.some((f) => f.severity === "blocking");

  const writing = evaluateWritingQuality(post, request.language);
  const originality = evaluateOriginality(post);
  const depth = evaluateDepth(post, brief);
  const seo = evaluateSeoQuality(post, brief);
  const readability = evaluateReadability(post, brief);
  const keyword = evaluateKeywordQuality(post, brief);
  const spam = evaluateSpamSignals(post, brief, request.language);
  const factuality = evaluateFactuality(request);
  const freshness = evaluateFreshness(request, post);

  const llm = hasBrokenStructure ? UNAVAILABLE_LLM_RESULT : await runLLMEvaluator(post, brief);

  return buildQualityReport({
    wordCount: countWords(post),
    keywordCoverage: keyword.keywordCoverage,
    revisionCount,
    outputs: { writing, originality, depth, seo, readability, keyword, structure, spam, factuality, freshness, llm },
  });
}

/**
 * The single entry point both the sync /v1/generate route and the async job
 * processor call — mirrors postRender.ts's "must never drift" pattern.
 * Never returns unvalidated content: every path either returns a PASSing
 * report or throws CONTENT_QUALITY_FAILED.
 */
export async function runContentQualityPipeline(
  request: GenerateRequestV1,
  provider: AIProvider = getAIProvider()
): Promise<QualityPipelineResult> {
  const brief = buildContentBrief(request);
  const plan = buildSeoPlan(request, brief);
  const maxRevisions = getMaxRevisions();

  let post = enforceSectionConstraint(await provider.generate(request, { brief, plan }), request.constraints);
  assertWordCountWithinTolerance(countWords(post), request.constraints);

  for (let revisionCount = 0; ; revisionCount++) {
    const reportWithoutStatus = await validate(request, post, revisionCount);

    // A capability gap (no source verification available) can never be
    // fixed by asking the model to try again — don't burn revision attempts on it.
    const unfixable = reportWithoutStatus.failedChecks.some(
      (f) => f.code === "FACTUALITY_UNVERIFIED" && f.severity === "blocking"
    );
    const revisionsRemaining = !unfixable && revisionCount < maxRevisions;
    const overallStatus = decideQualityGate(reportWithoutStatus, revisionsRemaining);
    const report: ContentQualityReport = { ...reportWithoutStatus, overallStatus };

    if (overallStatus === "PASS") {
      return { post, report };
    }

    if (overallStatus === "FAIL") {
      throw new ContentQualityFailedError(report);
    }

    const feedback = buildRevisionFeedback(reportWithoutStatus);
    const revised = await provider.revise({ request, previous: post, feedback, context: { brief, plan } });
    post = enforceSectionConstraint(revised, request.constraints);
    assertWordCountWithinTolerance(countWords(post), request.constraints);
  }
}

export function toQualitySummary(report: ContentQualityReport): ContentQualitySummary {
  return {
    status: "pass",
    score: report.overallScore,
    revisionCount: report.revisionCount,
    qualityVersion: report.qualityVersion,
  };
}
