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
 * `seendate` is `YYYYMMDDTHHMMSSZ` — GDELT's own docs describe it as "last
 * time this article was found by GDELT," not strictly first-published time,
 * so it is treated as a rough freshness signal only (see ../freshness.ts,
 * which never treats any single provider as sufficient on its own).
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
          publishedAt: a.seendate ? parseGdeltSeenDate(a.seendate) : null,
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

/** GDELT's seendate is `YYYYMMDDTHHMMSSZ` (e.g. "20260921T120000Z") — not
 * directly parseable by `new Date()`, so reformat to real ISO 8601 first. */
function parseGdeltSeenDate(raw: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw.trim());
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
