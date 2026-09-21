/**
 * Types for the source-retrieval layer (lib/server/sources/) — retrieving,
 * normalizing, and validating real external news sources BEFORE any
 * Anthropic call for freshness-sensitive requests. Living in lib/types/
 * (no server-side dependencies) so lib/server/content-quality/* and
 * lib/server/generation/* can both reference these shapes without a
 * circular import, matching the existing pattern in ContentQuality.ts.
 */

export type SourceProviderName = "currents" | "newsdata" | "gdelt";

/** One provider's result, normalized into a common shape — never a raw
 * provider-specific object is passed further down the pipeline. */
export interface NormalizedSource {
  provider: SourceProviderName;
  sourceId: string;
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  publisher: string | null;
  /** ISO 8601 string, or null if the provider gave no parseable timestamp —
   * never guessed or defaulted to "now". */
  publishedAt: string | null;
  retrievedAt: string;
  language: string | null;
  category: string | null;
  author: string | null;
  country: string | null;
}

export type FreshnessPolicy =
  | "TODAY_ONLY"
  | "LAST_24_HOURS"
  | "LAST_48_HOURS"
  | "LAST_7_DAYS"
  | "NO_FRESHNESS_REQUIREMENT";

/** Why a candidate source was excluded — kept on the source pack for
 * observability (see engine wiring) even though only approved sources are
 * ever sent to Anthropic. */
export interface RejectedSource {
  source: NormalizedSource;
  reason: string;
}

export interface EvidenceClaim {
  claim: string;
  supportedBy: string[]; // NormalizedSource.sourceId values
}

export interface ConflictedClaim {
  topic: string;
  reason: string;
  conflictingSourceIds: string[];
}

export type SourcePackStatus = "PASS" | "FAIL";

/** The immutable, locked context handed to the Anthropic rewriter — only
 * ever built once a source pack has passed every gate (see sourcePack.ts).
 * Anthropic receives exactly this and nothing else for factual grounding. */
export interface SourcePack {
  topic: string;
  keywords: string[];
  contentType: "blog";
  freshnessPolicy: FreshnessPolicy;
  validatedAt: string;
  status: SourcePackStatus;
  /** Approved, deduplicated, fresh, relevant, quality-passed sources. */
  sources: NormalizedSource[];
  approvedClaims: EvidenceClaim[];
  excludedClaims: ConflictedClaim[];
  /** Sources considered but rejected, with why — never sent to Anthropic,
   * kept only for observability/logging. */
  rejectedSources: RejectedSource[];
  /** How many of `sources` share the same original publisher after
   * dedup — see dedupe.ts: 3 providers surfacing the same wire-service
   * story is one independent source, not three. */
  providerCount: number;
  independentPublisherCount: number;
  failureReasons: string[];
}

export interface RetrievalAttemptLog {
  attempt: number;
  query: string;
  providersQueried: SourceProviderName[];
  providerErrors: Partial<Record<SourceProviderName, string>>;
  candidatesRetrieved: number;
  candidatesApproved: number;
  result: SourcePackStatus;
}

/** Full observability record for one retrieval+validation run — see
 * REQUIREMENTS section "Observability"/"Logging". Never includes secret
 * values (provider API keys are never part of this shape). */
export interface SourceRetrievalReport {
  requestId: string;
  topic: string;
  freshnessPolicy: FreshnessPolicy;
  attempts: RetrievalAttemptLog[];
  finalStatus: SourcePackStatus;
  sourcePack: SourcePack | null;
  failureReasons: string[];
}
