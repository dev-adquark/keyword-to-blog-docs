import { describe, expect, it } from "vitest";
import { buildSourcePack } from "@/lib/server/sources/sourcePack";
import { normalizedSource } from "./fixtures";

const NOW = new Date("2026-09-21T15:00:00.000Z");

describe("buildSourcePack", () => {
  it("PASSes with two fresh, relevant, quality, non-conflicting sources", () => {
    const candidates = [
      normalizedSource({ sourceId: "a", provider: "currents", publishedAt: NOW.toISOString(), title: "Company X launches major product update today", url: "https://a.example.com/x" }),
      normalizedSource({ sourceId: "b", provider: "newsdata", publisher: "b.example.com", publishedAt: NOW.toISOString(), title: "Company X rolls out new product features", url: "https://b.example.com/x" }),
    ];
    const pack = buildSourcePack({ topic: "Company X product update", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.status).toBe("PASS");
    expect(pack.sources.length).toBeGreaterThanOrEqual(2);
    expect(pack.rejectedSources).toHaveLength(0);
  });

  it("FAILs when every candidate is stale", () => {
    const candidates = [
      normalizedSource({ sourceId: "a", publishedAt: "2020-01-01T00:00:00.000Z" }),
      normalizedSource({ sourceId: "b", publishedAt: "2020-01-02T00:00:00.000Z" }),
    ];
    const pack = buildSourcePack({ topic: "Company X product update", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.status).toBe("FAIL");
    expect(pack.sources).toHaveLength(0);
    expect(pack.rejectedSources.every((r) => r.reason.startsWith("freshness"))).toBe(true);
  });

  it("FAILs when sources are fresh but irrelevant", () => {
    const candidates = [
      normalizedSource({ sourceId: "a", publishedAt: NOW.toISOString(), title: "Local weather turns rainy this weekend", description: "Rain expected across the region this weekend." }),
      normalizedSource({ sourceId: "b", publishedAt: NOW.toISOString(), title: "City council approves new park budget", description: "The council voted to fund a new park." }),
    ];
    const pack = buildSourcePack({ topic: "Company X product update", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.status).toBe("FAIL");
    expect(pack.rejectedSources.some((r) => r.reason.startsWith("relevance"))).toBe(true);
  });

  it("FAILs with only one approved source, even if it's perfect (completeness)", () => {
    const candidates = [normalizedSource({ sourceId: "a", publishedAt: NOW.toISOString(), title: "Company X launches major product update today" })];
    const pack = buildSourcePack({ topic: "Company X product update", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.status).toBe("FAIL");
    expect(pack.failureReasons.some((r) => r.includes("approved source"))).toBe(true);
  });

  it("excludes conflicting sources from the pack rather than merging them, and can still FAIL if that leaves too little", () => {
    const candidates = [
      normalizedSource({
        sourceId: "a",
        publishedAt: NOW.toISOString(),
        title: "Company X reports 25% revenue growth this quarter",
        description: "Company X's revenue grew 25% year over year, the company said today.",
      }),
      normalizedSource({
        sourceId: "b",
        publisher: "other.example.com",
        publishedAt: NOW.toISOString(),
        title: "Company X reports 40% revenue growth this quarter",
        description: "Company X's revenue grew 40% year over year, according to today's filing.",
        url: "https://other.example.com/x",
      }),
    ];
    const pack = buildSourcePack({ topic: "Company X revenue", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.sources).toHaveLength(0); // both sources' only claim was conflicted
    expect(pack.excludedClaims).toHaveLength(1);
    expect(pack.status).toBe("FAIL");
  });

  it("never relaxes freshness even when that's the only thing standing between FAIL and PASS", () => {
    const candidates = [
      normalizedSource({ sourceId: "a", publishedAt: "2020-01-01T00:00:00.000Z", title: "Company X launches major product update today" }),
      normalizedSource({ sourceId: "b", publisher: "b.example.com", publishedAt: "2020-01-02T00:00:00.000Z", title: "Company X rolls out new product features", url: "https://b.example.com/x" }),
    ];
    const pack = buildSourcePack({ topic: "Company X product update", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.status).toBe("FAIL");
  });
});
