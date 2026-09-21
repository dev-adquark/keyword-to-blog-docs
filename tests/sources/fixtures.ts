import type { NormalizedSource } from "@/lib/types";

export function normalizedSource(overrides: Partial<NormalizedSource> = {}): NormalizedSource {
  return {
    provider: "currents",
    sourceId: "src-1",
    title: "Company X announces major product update today",
    description:
      "Company X today announced a significant update to its flagship product, adding several new features requested by long-time customers and improving overall performance across every supported platform. Executives said the rollout will continue over the coming weeks, with additional regions gaining access on a staggered schedule through the end of the month.",
    content: null,
    url: "https://example-news.com/company-x-update",
    publisher: "example-news.com",
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    language: "en",
    category: "technology",
    author: "Jane Reporter",
    country: "us",
    ...overrides,
  };
}
