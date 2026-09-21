import { describe, expect, it } from "vitest";
import { evaluateCitationIntegrity } from "@/lib/server/content-quality/citationIntegrity";
import { goodPost } from "./fixtures";
import type { SourcePack } from "@/lib/types";

function pack(overrides: Partial<SourcePack> = {}): SourcePack {
  return {
    topic: "t",
    keywords: ["t"],
    contentType: "blog",
    freshnessPolicy: "TODAY_ONLY",
    validatedAt: new Date().toISOString(),
    status: "PASS",
    sources: [{ ...emptySourceDefaults(), url: "https://example.com/a", title: "A" }],
    approvedClaims: [],
    excludedClaims: [],
    rejectedSources: [],
    providerCount: 1,
    independentPublisherCount: 1,
    failureReasons: [],
    ...overrides,
  };
}

function emptySourceDefaults() {
  return {
    provider: "currents" as const,
    sourceId: "a",
    title: "A",
    description: null,
    content: null,
    url: "https://example.com/a",
    publisher: null,
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    language: null,
    category: null,
    author: null,
    country: null,
  };
}

describe("evaluateCitationIntegrity", () => {
  it("passes when every cited URL is present in the source pack", () => {
    const post = goodPost({ sources: [{ title: "A", url: "https://example.com/a", publishedAt: null }] });
    const result = evaluateCitationIntegrity(post, pack());
    expect(result.failedChecks).toHaveLength(0);
  });

  it("blocks when the post cites no sources at all", () => {
    const post = goodPost({ sources: undefined });
    const result = evaluateCitationIntegrity(post, pack());
    expect(result.failedChecks.some((f) => f.code === "MISSING_SOURCE_ATTRIBUTION")).toBe(true);
  });

  it("blocks a fabricated citation — a URL not present in the validated source pack", () => {
    const post = goodPost({ sources: [{ title: "Fake", url: "https://not-a-real-source.example.com/x", publishedAt: null }] });
    const result = evaluateCitationIntegrity(post, pack());
    expect(result.failedChecks.some((f) => f.code === "FABRICATED_CITATION")).toBe(true);
  });
});
