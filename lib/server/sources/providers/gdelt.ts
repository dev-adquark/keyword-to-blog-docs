import "server-only";
import type { NormalizedSource } from "@/lib/types";
import type { ProviderSearchResult, SourceProvider, SourceSearchParams } from "./provider";

const GDELT_DOC_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const REQUEST_TIMEOUT_MS = 10_000;

interface GdeltArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

/**
 * GDELT's DOC 2.0 article-search API is free/keyless (the pasted "GDELT"
 * credential didn't authenticate anywhere tested — this adapter doesn't
 * need one). Built against GDELT's long-documented `artlist`/JSON schema
 * (url/title/seendate/domain/language/sourcecountry); live verification was
 * blocked this session by GDELT's own rate limiter ("one request every 5
 * seconds"), so parsing here is defensive — a shape mismatch degrades to
 * zero sources rather than throwing.
 *
 * `seendate` (`YYYYMMDDTHHMMSSZ`) is GDELT's own crawl/discovery timestamp
 * — "the last time this article was found by GDELT" — NOT the article's
 * actual original publication time. GDELT's DOC 2.0 `artlist` output has no
 * separate publication-date field to fall back to. Treating `seendate` as
 * `publishedAt` would let a stale article that GDELT merely re-crawled
 * recently falsely satisfy the hard freshness requirement, so it is
 * deliberately left null here rather than guessed: GDELT sources can still
 * contribute discovery/relevance/evidence, but can never by themselves
 * satisfy freshness — see ../freshness.ts (missing publishedAt is always
 * rejected) and ../completeness.ts (other providers must supply the
 * fresh, dated evidence).
 */
export class GdeltProvider implements SourceProvider {
  readonly name = "gdelt" as const;

  isConfigured(): boolean {
    return true; // keyless public API
  }

  async search(params: SourceSearchParams): Promise<ProviderSearchResult> {
    const url = new URL(GDELT_DOC_URL);
    url.searchParams.set("query", params.query);
    url.searchParams.set("mode", "artlist");
    url.searchParams.set("format", "json");
    url.searchParams.set("maxrecords", String(Math.min(params.limit ?? 25, 50)));
    url.searchParams.set("sort", "hybridrel");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        return { sources: [], error: `gdelt_http_${response.status}` };
      }
      const text = await response.text();
      let data: { articles?: GdeltArticle[] };
      try {
        data = JSON.parse(text);
      } catch {
        // GDELT returns plain-text rate-limit/error notices (not JSON) when
        // throttled — degrade to "no sources" rather than crashing.
        return { sources: [], error: "gdelt_non_json_response" };
      }
      if (!Array.isArray(data.articles)) {
        return { sources: [], error: "gdelt_malformed_response" };
      }

      const now = new Date().toISOString();
      const sources: NormalizedSource[] = data.articles
        .filter((a) => a.url && a.title)
        .map((a) => ({
          provider: "gdelt",
          sourceId: a.url!,
          title: a.title!,
          description: null,
          content: null,
          url: a.url!,
          publisher: a.domain ?? null,
          // Deliberately not `parseGdeltSeenDate(a.seendate)` — see the
          // module comment above. `seendate` is discovery time, not
          // publication time, and is never used to satisfy freshness.
          publishedAt: null,
          retrievedAt: now,
          language: a.language ?? null,
          category: null,
          author: null,
          country: a.sourcecountry ?? null,
        }));

      return { sources };
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError" ? "gdelt_timeout" : "gdelt_network_error";
      return { sources: [], error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}
