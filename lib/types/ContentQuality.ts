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

/** VERIFIED means the content was actually generated through the
 * source-pack-first pipeline (see lib/server/content-quality/
 * sourceGroundedPipeline.ts) — real, retrieved, freshness-validated
 * sources, not merely "no problems detected". The evergreen generate/
 * repair pipeline (lib/server/content-quality/engine.ts) never reports
 * this — it has no source-retrieval capability of its own. */
export type FactualityStatus = "STANDARD_UNVERIFIED" | "VERIFICATION_UNAVAILABLE" | "VERIFIED";
/** VERIFIED_CURRENT means the claim was actually grounded in a real,
 * retrieved, freshness-validated source pack (see lib/server/sources/ and
 * lib/server/content-quality/citationIntegrity.ts) — not merely "no
 * problems detected". The evergreen pipeline (engine.ts) can never report
 * this; only the source-grounded pipeline can. */
export type FreshnessStatus = "NOT_APPLICABLE" | "VERIFIED_CURRENT" | "UNVERIFIED_ACCEPTABLE" | "UNVERIFIED_BLOCKED";
/** Only two outcomes now — see lib/server/content-quality/qualityGate.ts:
 * any blocking failedCheck fails the gate, everything else passes. There is
 * no longer an intermediate "keep looping" status; the engine sequences a
 * fixed generate → mechanical-fix → repair flow explicitly instead. */
export type QualityGateStatus = "PASS" | "FAIL";

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
  /** 0 or 1 — whether the one allowed AI repair call was used (see the 2-call budget in engine.ts). */
  revisionCount: number;
  passedChecks: string[];
  failedChecks: FailedCheck[];
  warnings: string[];
  revisionReasons: string[];
}

/** The only quality information ever returned in a public API response —
 * deliberately minimal (see lib/server/content-quality/engine.ts). */
export interface ContentQualitySummary {
  status: "pass";
  score: number;
  revisionCount: number;
  qualityVersion: string;
}

/**
 * A partial, targeted correction for specific fields/sections — never a full
 * re-generation. Returned by AIProvider.repair() and merged onto the
 * existing post, preserving everything not explicitly patched (see
 * lib/server/content-quality/repairPatch.ts).
 */
export interface RepairPatch {
  title?: string;
  slugSuggestion?: string;
  meta?: { description?: string; primaryKeyword?: string };
  sections?: Array<{ index: number; heading?: string; contentMarkdown?: string }>;
  faqs?: Array<{ question: string; answer: string }>;
  conclusion?: string;
}
