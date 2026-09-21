import "server-only";
import type { NormalizedSource, SourceProviderName } from "@/lib/types";

export interface SourceSearchParams {
  query: string;
  language?: string;
  country?: string;
  /** Only used to narrow provider-side date filters where a provider
   * supports it — the real freshness gate is always re-checked
   * deterministically afterward (see ../freshness.ts); a provider's own
   * "recent" filter is never trusted on its own. ISO date (YYYY-MM-DD). */
  publishedAfter?: string;
  limit?: number;
}

/** A provider adapter's only job is "give me normalized candidate sources
 * for this query" — it must never throw for an ordinary empty/no-result
 * response, and must never silently fabricate a source. Network/auth
 * failures are reported via the return value, not exceptions, so one
 * provider failing never crashes the whole retrieval attempt (see
 * REQUIREMENTS "Provider failure handling"). */
export interface SourceProvider {
  readonly name: SourceProviderName;
  isConfigured(): boolean;
  search(params: SourceSearchParams): Promise<ProviderSearchResult>;
}

export interface ProviderSearchResult {
  sources: NormalizedSource[];
  /** Set only on a genuine failure (network error, non-2xx, malformed
   * response) — never set just because zero results were found. */
  error?: string;
}

/** Some providers (NewsData.io's free tier) return locked-content
 * placeholder strings instead of real text/null — never pass those through
 * as if they were genuine article content. */
export function isLockedPlaceholder(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^ONLY AVAILABLE IN\b/i.test(value.trim());
}
