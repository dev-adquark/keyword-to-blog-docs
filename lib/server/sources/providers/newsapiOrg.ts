import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { env } from "../../env";
import type { ProviderSearchResult, SourceProvider, SourceSearchParams } from "./provider";

const NEWSAPI_ORG_URL = "https://newsapi.org/v2/everything";
const REQUEST_TIMEOUT_MS = 10_000;

interface NewsApiOrgArticle {
  source?: { id: string | null; name?: string };
  author?: string | null;
  title?: string;
  description?: string | null;
  url?: string;
  publishedAt?: string;
  content?: string | null;
}

const TRUNCATION_SUFFIX = /…?\s*\[\+\d+ chars\]\s*$/;

/** Strips NewsAPI.org's free-tier truncation marker ("… [+3897 chars]") —
 * the remaining text is still real, just partial, unlike NewsData.io's
 * fully-locked placeholder string (see newsdata.ts). Never treat the
 * marker itself as content. */
function stripTruncationMarker(value: string | null | undefined): string | null {
  if (!value) return null;
  const stripped = value.replace(TRUNCATION_SUFFIX, "").trim();
  return stripped || null;
}

/**
 * Verified live (see session notes): the pasted "news api" credential is a
 * real newsapi.org key (not thenewsapi.com's, despite the label). Fields
 * confirmed against a real response: source.name/author/title/description/
 * url/publishedAt (ISO 8601 with trailing Z)/content. Both `description`
 * and `content` are truncated on the free tier with a trailing
 * "… [+N chars]" marker, which is stripped rather than passed through
 * verbatim or treated as complete text.
 */
export class NewsApiOrgProvider implements SourceProvider {
  readonly name = "newsapi_org" as const;

  isConfigured(): boolean {
    return Boolean(env.NEWSAPI_ORG_KEY);
  }

  async search(params: SourceSearchParams): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) return { sources: [], error: "not_configured" };

    const url = new URL(NEWSAPI_ORG_URL);
    url.searchParams.set("q", params.query);
    url.searchParams.set("sortBy", "publishedAt");
    url.searchParams.set("pageSize", String(Math.min(params.limit ?? 25, 100)));
    if (params.language) url.searchParams.set("language", params.language);
    if (params.publishedAfter) url.searchParams.set("from", params.publishedAfter);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), {
        headers: { "X-Api-Key": env.NEWSAPI_ORG_KEY },
        signal: controller.signal,
      });
      if (!response.ok) {
        return { sources: [], error: `newsapi_org_http_${response.status}` };
      }
      const data = (await response.json()) as { status?: string; articles?: NewsApiOrgArticle[] };
      if (data.status !== "ok" || !Array.isArray(data.articles)) {
        return { sources: [], error: "newsapi_org_malformed_response" };
      }

      const now = new Date().toISOString();
      const sources: NormalizedSource[] = data.articles
        .filter((a) => a.url && a.title && a.title !== "[Removed]")
        .map((a) => {
          const publishedAt = a.publishedAt ? safeIsoDate(a.publishedAt) : null;
          return {
            provider: "newsapi_org",
            sourceId: a.url!,
            title: a.title!,
            description: stripTruncationMarker(a.description),
            content: stripTruncationMarker(a.content),
            url: a.url!,
            publisher: a.source?.name ?? null,
            publishedAt,
            retrievedAt: now,
            language: params.language ?? null,
            category: null,
            author: a.author ?? null,
            country: params.country ?? null,
          };
        });

      return { sources };
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError" ? "newsapi_org_timeout" : "newsapi_org_network_error";
      return { sources: [], error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeIsoDate(raw: string): string | null {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
