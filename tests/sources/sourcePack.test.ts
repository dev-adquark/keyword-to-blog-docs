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

  it("REGRESSION: a conflict in ONE story cluster does not discard the whole pack — other, unrelated, non-conflicting sources still pass", () => {
    const candidates = [
      // Cluster 1: conflicting revenue figures — excluded.
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
      // Cluster 2: a completely different, non-conflicting story about the
      // same overall topic — must still be approved.
      normalizedSource({
        sourceId: "c",
        publisher: "third.example.com",
        publishedAt: NOW.toISOString(),
        title: "Company X names new chief financial officer",
        description:
          "Company X announced the appointment of a new chief financial officer effective next month, the company said in a statement today. The incoming executive previously served as finance chief at a competing firm and is expected to lead the company's next phase of international expansion.",
        url: "https://third.example.com/x",
      }),
      normalizedSource({
        sourceId: "d",
        publisher: "fourth.example.com",
        publishedAt: NOW.toISOString(),
        title: "Company X appoints new finance chief",
        description:
          "The company confirmed a new chief financial officer will start next month, replacing the outgoing executive who is retiring after a decade in the role. Analysts said the appointment signals continuity in the company's financial strategy heading into next year.",
        url: "https://fourth.example.com/x",
      }),
    ];
    const pack = buildSourcePack({ topic: "Company X news", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.excludedClaims).toHaveLength(1); // the revenue conflict
    expect(pack.sources.map((s) => s.sourceId).sort()).toEqual(["c", "d"]); // the CFO story still made it through
    expect(pack.status).toBe("PASS");
  });

  it("REGRESSION: three providers returning the same syndicated story collapse to one deduped source, and completeness judges it on its own merits (not 'too few sources')", () => {
    const sharedTitle = "Company X launches major product update today";
    const sharedDescription =
      "Company X today announced a major expansion of its flagship product line, adding a dozen new capabilities that customers have requested for over a year. The rollout begins this week across every supported region, with executives describing it as the most significant update since the product's original launch. Analysts covering the announcement said the changes directly address several long-standing customer complaints about integration flexibility and overall platform performance, and several enterprise customers have already begun piloting the new capabilities ahead of the wider release. Industry observers noted the timing coincides with a major competitor's own product refresh, intensifying competition for enterprise customers evaluating both platforms ahead of next year's renewal cycle. The company said pricing for existing subscribers would remain unchanged through the next renewal cycle, and support documentation for the new capabilities is already available to partners. A company spokesperson added that additional regional rollouts are planned for the following quarter, pending regulatory review in several international markets.";
    const candidates = [
      normalizedSource({ sourceId: "a", provider: "currents", publishedAt: NOW.toISOString(), title: sharedTitle, description: sharedDescription, url: "https://wire.example.com/story" }),
      normalizedSource({ sourceId: "b", provider: "newsdata", publishedAt: NOW.toISOString(), title: sharedTitle, description: sharedDescription, url: "https://wire.example.com/story?src=aggregator" }),
      normalizedSource({ sourceId: "c", provider: "newsapi_org", publishedAt: NOW.toISOString(), title: sharedTitle, description: sharedDescription, url: "https://mirror.example.com/story-copy" }),
    ];
    const pack = buildSourcePack({ topic: "Company X product update", keywords: ["Company X"], freshnessPolicy: "TODAY_ONLY", candidates, now: NOW });
    expect(pack.sources).toHaveLength(1); // deduped down to one real article
    expect(pack.providerCount).toBe(3); // raw candidate count before dedup
    expect(pack.status).toBe("PASS"); // the single surviving source is substantial enough on its own
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
