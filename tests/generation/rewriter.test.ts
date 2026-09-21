import { describe, expect, it, vi } from "vitest";
import type { SourcePack } from "@/lib/types";

vi.mock("@/lib/server/generation/anthropicClient", () => ({
  runWithRetries: vi.fn(),
}));

const { rewriteFromSourcePack } = await import("@/lib/server/generation/rewriter");
const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");

const baseRequest = {
  keywords: ["stock market"],
  topic: "stock market today",
  language: "en",
  tone: "professional" as const,
  constraints: { maxWords: 500 },
  format: { responseTypes: ["json" as const] },
};

function pack(overrides: Partial<SourcePack> = {}): SourcePack {
  return {
    topic: "stock market today",
    keywords: ["stock market"],
    contentType: "blog",
    freshnessPolicy: "TODAY_ONLY",
    validatedAt: new Date().toISOString(),
    status: "PASS",
    sources: [
      {
        provider: "currents",
        sourceId: "s1",
        title: "Real retrieved source",
        description: "d",
        content: null,
        url: "https://real-verified-source.example.com/article",
        publisher: "example.com",
        publishedAt: "2026-09-21T10:00:00.000Z",
        retrievedAt: new Date().toISOString(),
        language: "en",
        category: null,
        author: null,
        country: null,
      },
    ],
    approvedClaims: [],
    excludedClaims: [],
    rejectedSources: [],
    providerCount: 1,
    independentPublisherCount: 1,
    failureReasons: [],
    ...overrides,
  };
}

const validRawPost = {
  title: "t",
  slugSuggestion: "t",
  meta: { description: "d", primaryKeyword: "test" },
  outline: { h1: "t", h2: ["a"] },
  sections: [{ type: "body", contentMarkdown: "content" }],
  conclusion: "the end",
};

describe("rewriteFromSourcePack", () => {
  it("never trusts the model's own 'sources' field — always overwrites it with the exact, verified pack sources", async () => {
    // Simulates the real observed failure: the model retypes a plausible
    // but subtly wrong URL for a real source (a single dropped character
    // is enough to make a genuine article look fabricated).
    vi.mocked(runWithRetries).mockResolvedValue({
      ...validRawPost,
      sources: [{ title: "Real retrieved source", url: "https://real-verified-source.example.com/articl", publishedAt: null }],
    });

    const result = await rewriteFromSourcePack(baseRequest, pack());

    expect(result.sources).toEqual([
      { title: "Real retrieved source", url: "https://real-verified-source.example.com/article", publishedAt: "2026-09-21T10:00:00.000Z" },
    ]);
  });

  it("attaches the real source list even when the model omits 'sources' entirely", async () => {
    vi.mocked(runWithRetries).mockResolvedValue({ ...validRawPost, sources: undefined });

    const result = await rewriteFromSourcePack(baseRequest, pack());

    expect(result.sources).toHaveLength(1);
    expect(result.sources![0]!.url).toBe("https://real-verified-source.example.com/article");
  });
});
