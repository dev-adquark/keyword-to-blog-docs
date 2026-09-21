import "server-only";
import type { FreshnessPolicy, NormalizedSource, RejectedSource, SourcePack } from "@/lib/types";
import { isWithinFreshnessPolicy } from "./freshness";
import { evaluateRelevance } from "./relevance";
import { evaluateSourceQuality } from "./quality";
import { dedupeSources } from "./dedupe";
import { buildEvidenceMap } from "./evidence";
import { evaluateCompleteness } from "./completeness";

export interface BuildSourcePackInput {
  topic: string;
  keywords: string[];
  freshnessPolicy: FreshnessPolicy;
  /** Raw normalized candidates from every provider queried this attempt —
   * not yet deduplicated or validated. */
  candidates: NormalizedSource[];
  now?: Date;
}

/**
 * Runs every required pre-Anthropic gate in order (see REQUIREMENTS
 * "Universal architecture") and assembles the final source pack. A `PASS`
 * pack contains ONLY sources/claims that survived every stage — nothing
 * rejected or conflicted is ever included, so the Anthropic rewriter simply
 * cannot see excluded material (see ../generation/rewriter.ts).
 */
export function buildSourcePack(input: BuildSourcePackInput): SourcePack {
  const now = input.now ?? new Date();
  const rejectedSources: RejectedSource[] = [];
  const failureReasons: string[] = [];

  const freshnessPassed: NormalizedSource[] = [];
  for (const candidate of input.candidates) {
    if (isWithinFreshnessPolicy(candidate, input.freshnessPolicy, now)) {
      freshnessPassed.push(candidate);
    } else {
      rejectedSources.push({ source: candidate, reason: "freshness: missing, unparseable, stale, or future-dated publishedAt" });
    }
  }

  const relevancePassed: NormalizedSource[] = [];
  for (const candidate of freshnessPassed) {
    const relevance = evaluateRelevance(candidate, input.keywords, input.topic);
    if (relevance.relevant) {
      relevancePassed.push(candidate);
    } else {
      rejectedSources.push({ source: candidate, reason: `relevance: ${relevance.reason}` });
    }
  }

  const qualityPassed: NormalizedSource[] = [];
  for (const candidate of relevancePassed) {
    const quality = evaluateSourceQuality(candidate);
    if (quality.passed) {
      qualityPassed.push(candidate);
    } else {
      rejectedSources.push({ source: candidate, reason: `quality: ${quality.reason}` });
    }
  }

  const { approved: deduped, providerCount } = dedupeSources(qualityPassed);
  for (const candidate of qualityPassed) {
    if (!deduped.includes(candidate)) {
      rejectedSources.push({ source: candidate, reason: "duplicate: identical/near-identical URL or title already represented" });
    }
  }

  const { approvedClaims, excludedClaims } = buildEvidenceMap(deduped);
  const conflictedSourceIds = new Set(excludedClaims.flatMap((c) => c.conflictingSourceIds));
  const approvedSources = deduped.filter((s) => !conflictedSourceIds.has(s.sourceId));
  for (const source of deduped) {
    if (conflictedSourceIds.has(source.sourceId)) {
      rejectedSources.push({ source, reason: "conflict: disagrees with another source covering the same story on figures/dates" });
    }
  }

  const completeness = evaluateCompleteness(approvedSources);
  if (!completeness.passed && completeness.reason) {
    failureReasons.push(completeness.reason);
  }

  const independentPublisherCount = new Set(
    approvedSources.map((s) => (s.publisher ?? s.url).toLowerCase().trim())
  ).size;

  const status = completeness.passed && approvedSources.length > 0 ? "PASS" : "FAIL";
  if (approvedSources.length === 0) failureReasons.push("no sources survived freshness/relevance/quality/dedup/conflict validation");

  return {
    topic: input.topic,
    keywords: input.keywords,
    contentType: "blog",
    freshnessPolicy: input.freshnessPolicy,
    validatedAt: now.toISOString(),
    status,
    sources: approvedSources,
    approvedClaims: approvedClaims.filter((c) => c.supportedBy.some((id) => approvedSources.some((s) => s.sourceId === id))),
    excludedClaims,
    rejectedSources,
    providerCount,
    independentPublisherCount,
    failureReasons,
  };
}
