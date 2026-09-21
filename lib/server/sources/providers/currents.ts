import "server-only";
import type { NormalizedSource } from "@/lib/types";
import { env } from "../../env";
import { isLockedPlaceholder, type ProviderSearchResult, type SourceProvider, type SourceSearchParams } from "./provider";

const CURRENTS_SEARCH_URL = "https://api.currentsapi.services/v1/search";
const REQUEST_TIMEOUT_MS = 10_000;

interface CurrentsArticle {
  id?: string;
  title?: string;
  description?: string;
  url?: string;
  author?: string;
  language?: string;
  category?: string[];
  published?: string;
}

/** Verified live (see session notes): fields are id/title/description/url/
 * author/language/category[]/published ("2026-09-21 10:02:00 +0000", which
 * `new Date()` parses correctly). Currents has no separate publisher/domain
 * field — derived from the URL's hostname instead. */
export class CurrentsProvider implements SourceProvider {
  readonly name = "currents" as const;

  isConfigured(): boolean {
    return Boolean(env.CURRENTS_API_KEY);
  }

  async search(params: SourceSearchParams): Promise<ProviderSearchResult> {
    if (!this.isConfigured()) return { sources: [], error: "not_configured" };

    const url = new URL(CURRENTS_SEARCH_URL);
    url.searchParams.set("keywords", params.query);
    url.searchParams.set("apiKey", env.CURRENTS_API_KEY);
    if (params.language) url.searchParams.set("language", params.language);
    if (params.country) url.searchParams.set("country", params.country);
    if (params.publishedAfter) url.searchParams.set("start_date", params.publishedAfter);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        return { sources: [], error: `currents_http_${response.status}` };
      }
      const data = (await response.json()) as { status?: string; news?: CurrentsArticle[] };
      if (data.status !== "ok" || !Array.isArray(data.news)) {
        return { sources: [], error: "currents_malformed_response" };
      }

      const now = new Date().toISOString();
      const sources: NormalizedSource[] = data.news
        .filter((a) => a.url && a.title)
        .map((a) => {
          const publishedAt = a.published ? safeIsoDate(a.published) : null;
          return {
            provider: "currents",
            sourceId: a.id ?? a.url!,
            title: a.title!,
            description: isLockedPlaceholder(a.description) ? null : a.description ?? null,
            content: null,
            url: a.url!,
            publisher: hostnameOf(a.url!),
            publishedAt,
            retrievedAt: now,
            language: a.language ?? null,
            category: a.category?.[0] ?? null,
            author: a.author ?? null,
            country: params.country ?? null,
          };
        });

      return { sources };
    } catch (err) {
      const message = err instanceof Error && err.name === "AbortError" ? "currents_timeout" : "currents_network_error";
      return { sources: [], error: message };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function safeIsoDate(raw: string): string | null {
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
