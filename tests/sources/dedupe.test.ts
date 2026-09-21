import { describe, expect, it } from "vitest";
import { dedupeSources } from "@/lib/server/sources/dedupe";
import { normalizedSource } from "./fixtures";

describe("dedupeSources", () => {
  it("removes an exact duplicate URL", () => {
    const a = normalizedSource({ sourceId: "a", url: "https://example.com/story" });
    const b = normalizedSource({ sourceId: "b", url: "https://example.com/story" });
    const result = dedupeSources([a, b]);
    expect(result.approved).toHaveLength(1);
  });

  it("removes a duplicate URL that differs only by tracking params/trailing slash", () => {
    const a = normalizedSource({ sourceId: "a", url: "https://example.com/story/" });
    const b = normalizedSource({ sourceId: "b", url: "https://example.com/story?utm_source=twitter" });
    const result = dedupeSources([a, b]);
    expect(result.approved).toHaveLength(1);
  });

  it("removes a near-identical (syndicated) headline even from a different URL", () => {
    const a = normalizedSource({
      sourceId: "a",
      url: "https://example.com/story-1",
      title: "Company X announces major product update today",
    });
    const b = normalizedSource({
      sourceId: "b",
      url: "https://mirror.example.com/story-1-copy",
      title: "Company X announces major product update, today",
    });
    const result = dedupeSources([a, b]);
    expect(result.approved).toHaveLength(1);
  });

  it("keeps two genuinely different stories", () => {
    const a = normalizedSource({ sourceId: "a", url: "https://example.com/story-a", title: "Company X launches new product line" });
    const b = normalizedSource({ sourceId: "b", url: "https://example.com/story-b", title: "Regulators fine Company Y for data breach" });
    const result = dedupeSources([a, b]);
    expect(result.approved).toHaveLength(2);
  });

  it("counts independent publishers correctly — 3 providers returning the same publisher's article is still one independent source", () => {
    const a = normalizedSource({ sourceId: "a", provider: "currents", publisher: "reuters.com", url: "https://reuters.com/story", title: "Company X announces major product update today" });
    const b = normalizedSource({ sourceId: "b", provider: "newsdata", publisher: "reuters.com", url: "https://reuters.com/story?src=aggregator", title: "Company X announces major product update today" });
    const c = normalizedSource({ sourceId: "c", provider: "gdelt", publisher: "apnews.com", url: "https://apnews.com/story", title: "Regulators open inquiry into Company Y's data practices" });
    const result = dedupeSources([a, b, c]);
    expect(result.providerCount).toBe(3);
    expect(result.independentPublisherCount).toBe(2); // reuters.com (deduped) + apnews.com
  });
});
