import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { jaccardSimilarity } from "../content-quality/textStats";

const NEAR_DUPLICATE_TITLE_THRESHOLD = 0.85;

export interface DedupeResult {
  approved: NormalizedSource[];
  /** Raw candidate count before dedup — three providers surfacing the same
   * wire-service story counts three times here. */
  providerCount: number;
  /** Distinct publishers among the deduplicated, approved sources — the
   * number that actually matters for "is this corroborated by independent
   * outlets", per REQUIREMENTS "Duplicate detection". */
  independentPublisherCount: number;
}

/** Removes identical URLs, normalized-URL duplicates, and near-identical
 * titles (syndicated copies of the same wire story) — keeping the first
 * occurrence encountered (callers should order candidates by provider
 * priority/recency beforehand if that matters). Three providers returning
 * the same publisher's article collapses to one entry here, and is also
 * reflected in `independentPublisherCount` so downstream corroboration
 * logic never treats duplicate provider coverage as independent
 * confirmation. */
export function dedupeSources(sources: NormalizedSource[]): DedupeResult {
  const seenUrls = new Set<string>();
  const approved: NormalizedSource[] = [];

  for (const source of sources) {
    const normalizedUrl = normalizeUrl(source.url);
    if (seenUrls.has(normalizedUrl)) continue;

    const isNearDuplicateTitle = approved.some(
      (kept) => jaccardSimilarity(kept.title, source.title) >= NEAR_DUPLICATE_TITLE_THRESHOLD
    );
    if (isNearDuplicateTitle) continue;

    seenUrls.add(normalizedUrl);
    approved.push(source);
  }

  const publishers = new Set(
    approved.map((s) => (s.publisher ?? hostnameOf(s.url) ?? s.url).toLowerCase().trim())
  );

  return {
    approved,
    providerCount: sources.length,
    independentPublisherCount: publishers.size,
  };
}

function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = "";
    // Strip common tracking params so the same article with different
    // campaign tags still collapses to one entry.
    const stripParams = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "ref", "source"];
    for (const p of stripParams) url.searchParams.delete(p);
    const path = url.pathname.replace(/\/+$/, "");
    return `${url.hostname.replace(/^www\./, "")}${path}${url.search}`.toLowerCase();
  } catch {
    return raw.toLowerCase().trim();
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
