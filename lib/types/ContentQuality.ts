/**
 * Types shared between lib/server/generation/* (which needs ContentBrief to
 * enrich its prompts) and lib/server/content-quality/* (which needs the same
 * shapes for validation/revision). Living in lib/types/ — which has no
 * server-side dependencies — avoids a circular import between those two
 * server modules.
 */

/** Deterministic, heuristic read of what the request is asking for — built
 * from the request fields, not a separate model call (see contentBrief.ts). */
export interface ContentBrief {
  primaryKeyword: string;
  relatedKeywords: string[];
  searchIntent: "informational" | "commercial" | "navigational" | "transactional";
  audience?: string;
  language: string;
  region?: string;
  topic: string;
  requiredConcepts: string[];
  suggestedSections: string[];
  faqTopics: string[];
}

/** Internal SEO guidance derived from the brief, folded into the generation
 * prompt — never exposed to the API consumer. */
export interface SeoPlan {
  titleDirection: string;
  metaDescriptionDirection: string;
  h2Guidance: string[];
  keywordPlacementNotes: string;
}

export type FailedCheckSeverity = "blocking" | "warning";

export interface FailedCheck {
  code: string;
  severity: FailedCheckSeverity;
  message: string;
  section?: string;
}

/** What the revision engine hands back to the generation provider — the
 * exact, targeted instructions built from failedChecks (see revision.ts). */
export interface RevisionFeedback {
  failedChecks: FailedCheck[];
  instructions: string;
}

export type FactualityStatus = "STANDARD_UNVERIFIED" | "VERIFICATION_UNAVAILABLE";
export type FreshnessStatus = "NOT_APPLICABLE" | "UNVERIFIED_ACCEPTABLE" | "UNVERIFIED_BLOCKED";
export type QualityGateStatus = "PASS" | "REVISION_REQUIRED" | "FAIL";

/** Full internal report — logged/stored, never returned to the API consumer
 * verbatim (see ContentQualitySummary for the public-safe subset). */
export interface ContentQualityReport {
  qualityVersion: string;
  overallStatus: QualityGateStatus;
  overallScore: number;
  writingScore: number;
  originalityScore: number;
  depthScore: number;
  seoScore: number;
  readabilityScore: number;
  keywordScore: number;
  structureScore: number;
  factualityStatus: FactualityStatus;
  freshnessStatus: FreshnessStatus;
  wordCount: number;
  keywordCoverage: number;
  revisionCount: number;
  passedChecks: string[];
  failedChecks: FailedCheck[];
  warnings: string[];
  revisionReasons: string[];
  llmEvaluatorAvailable: boolean;
}

/** The only quality information ever returned in a public API response —
 * deliberately minimal (see lib/server/content-quality/engine.ts). */
export interface ContentQualitySummary {
  status: "pass";
  score: number;
  revisionCount: number;
  qualityVersion: string;
}

/** Schema-validated shape of the LLM quality evaluator's own output — never
 * trusted as the sole signal (see lib/server/content-quality/llmEvaluator.ts). */
export interface LLMEvaluation {
  usefulnessScore: number;
  depthScore: number;
  searchIntentMatchScore: number;
  naturalWritingScore: number;
  originalityOfIdeasScore: number;
  factualPlausibilityScore: number;
  concerns: string[];
}
