import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { env } from "../../env";
import { isLockedPlaceholder, type ProviderSearchResult, type SourceProvider, type SourceSearchParams } from "./provider";

const NEWSDATA_LATEST_URL = "https://newsdata.io/api/1/latest";
const REQUEST_TIMEOUT_MS = 10_000;

interface NewsDataArticle {
  article_id?: string;
  title?: string;
  description?: string;
  content?: string;
  link?: string;
  creator?: string[];
  language?: string;
  country?: string[];
  category?: string[];
  pubDate?: string;
  pubDateTZ?: string;
  source_id?: string;
  source_name?: string;
}

/** Verified live (see session notes): the pasted "pub_..." credential is a
 * NewsData.io key, not thenewsapi.com's — this adapter targets NewsData.io's
 * real /latest endpoint. `content` returns a locked placeholder string
 * ("ONLY AVAILABLE IN PAID PLANS") on the free tier — never pass that
 * through as real article content. `pubDate` has no offset in the string
 * itself; `pubDateTZ` says it's UTC. */
export class NewsDataProvider implements SourceProvider {
  readonly name = "newsdata" as const;

  isConfigured(): boolean {
    return Boolean(env.NEWSDATA_API_KEY);
  }

  async search(params: SourceSearchParams): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) return { sources: [], error: "not_configured" };

    const url = new URL(NEWSDATA_LATEST_URL);
    url.searchParams.set("apikey", env.NEWSDATA_API_KEY);
    url.searchParams.set("q", params.query);
    if (params.language) url.searchParams.set("language", params.language);
    if (params.country) url.searchParams.set("country", params.country);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        return { sources: [], error: `newsdata_http_${response.status}` };
      }
      const data = (await response.json()) as { status?: string; results?: NewsDataArticle[] };
      if (data.status !== "success" || !Array.isArray(data.results)) {
        return { sources: [], error: "newsdata_malformed_response" };
      }

      const now = new Date().toISOString();
      const sources: NormalizedSource[] = data.results
        .filter((a) => a.link && a.title)
        .map((a) => {
          const publishedAt = a.pubDate ? safeIsoDate(`${a.pubDate} ${a.pubDateTZ ?? "UTC"}`) : null;
          const content = isLockedPlaceholder(a.content) ? null : a.content ?? null;
          const description = isLockedPlaceholder(a.description) ? null : a.description ?? null;
          return {
            provider: "newsdata",
            sourceId: a.article_id ?? a.link!,
            title: a.title!,
            description,
            content,
            url: a.link!,
            publisher: a.source_name ?? a.source_id ?? null,
            publishedAt,
            retrievedAt: now,
            language: a.language ?? null,
            category: a.category?.[0] ?? null,
            author: a.creator?.[0] ?? null,
            country: a.country?.[0] ?? null,
          };
        });

      return { sources };
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError" ? "newsdata_timeout" : "newsdata_network_error";
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
