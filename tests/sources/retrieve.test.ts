import { describe, expect, it, vi } from "vitest";
import { retrieveValidatedSourcePack } from "@/lib/server/sources/retrieve";
import type { SourceProvider } from "@/lib/server/sources/providers/provider";
import { normalizedSource } from "./fixtures";

const NOW = new Date("2026-09-21T15:00:00.000Z");

function fakeProvider(name: "currents" | "newsdata" | "gdelt", impl: SourceProvider["search"]): SourceProvider {
  return { name, isConfigured: () => true, search: vi.fn(impl) };
}

function goodCandidates(prefix: string) {
  return [
    normalizedSource({
      sourceId: `${prefix}-a`,
      publishedAt: NOW.toISOString(),
      title: "Company X launches major product update today",
      url: `https://${prefix}-a.example.com/x`,
    }),
    normalizedSource({
      sourceId: `${prefix}-b`,
      publisher: `${prefix}-b.example.com`,
      publishedAt: NOW.toISOString(),
      title: "Company X rolls out new product features",
      url: `https://${prefix}-b.example.com/x`,
    }),
  ];
}

describe("retrieveValidatedSourcePack", () => {
  it("passes on the first attempt when the first round already yields a valid pack", async () => {
    const search = vi.fn(async () => ({ sources: goodCandidates("p1") }));
    const providers = [fakeProvider("currents", search)];

    const report = await retrieveValidatedSourcePack({
      requestId: "req_1",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers,
      now: NOW,
    });

    expect(report.finalStatus).toBe("PASS");
    expect(report.attempts).toHaveLength(1);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("retries with a broader query on failure and succeeds on the second attempt", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ sources: [] }) // attempt 1: nothing
      .mockResolvedValueOnce({ sources: goodCandidates("p2") }); // attempt 2: enough
    const providers = [fakeProvider("currents", search)];

    const report = await retrieveValidatedSourcePack({
      requestId: "req_2",
      topic: "Company X product update",
      keywords: ["Company X", "product", "launch"],
      freshnessPolicy: "TODAY_ONLY",
      providers,
      now: NOW,
    });

    expect(report.finalStatus).toBe("PASS");
    expect(report.attempts).toHaveLength(2);
    expect(report.attempts[0]!.query).not.toBe(report.attempts[1]!.query);
  });

  it("gives up after exactly 3 failed attempts — never a 4th", async () => {
    const search = vi.fn(async () => ({ sources: [] }));
    const providers = [fakeProvider("currents", search)];

    const report = await retrieveValidatedSourcePack({
      requestId: "req_3",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers,
      now: NOW,
    });

    expect(report.finalStatus).toBe("FAIL");
    expect(report.attempts).toHaveLength(3);
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("REGRESSION: never returns an empty failure-reason array on total failure — the last attempt's real SourcePack (with its actual failureReasons) is preserved, not discarded", async () => {
    const search = vi.fn(async () => ({ sources: [] }));
    const providers = [fakeProvider("currents", search)];

    const report = await retrieveValidatedSourcePack({
      requestId: "req_8",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers,
      now: NOW,
    });

    expect(report.finalStatus).toBe("FAIL");
    expect(report.sourcePack).not.toBeNull();
    expect(report.sourcePack!.status).toBe("FAIL");
    expect(report.sourcePack!.failureReasons.length).toBeGreaterThan(0);
  });

  it("never relaxes the freshness policy across retries, even though it keeps failing", async () => {
    const staleOnly = vi.fn(async () => ({
      sources: [
        normalizedSource({ sourceId: "s1", publishedAt: "2020-01-01T00:00:00.000Z" }),
        normalizedSource({ sourceId: "s2", publishedAt: "2020-01-02T00:00:00.000Z" }),
      ],
    }));
    const providers = [fakeProvider("currents", staleOnly)];

    const report = await retrieveValidatedSourcePack({
      requestId: "req_4",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers,
      now: NOW,
    });

    expect(report.finalStatus).toBe("FAIL");
    expect(report.attempts.every((a) => a.result === "FAIL")).toBe(true);
  });

  it("REGRESSION: succeeds using the ONE provider that responds, even when the OTHER TWO configured providers both fail", async () => {
    const failingA = fakeProvider("currents", async () => ({ sources: [], error: "currents_timeout" }));
    const failingB = fakeProvider("gdelt", async () => ({ sources: [], error: "gdelt_http_500" }));
    const workingC = fakeProvider("newsdata", async () => ({ sources: goodCandidates("p7") }));

    const report = await retrieveValidatedSourcePack({
      requestId: "req_7",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers: [failingA, failingB, workingC],
      now: NOW,
    });

    expect(report.finalStatus).toBe("PASS");
    expect(report.sourcePack!.sources.length).toBeGreaterThan(0);
    expect(report.attempts[0]!.providerErrors).toEqual({ currents: "currents_timeout", gdelt: "gdelt_http_500" });
  });

  it("continues with remaining providers when one fails, and records the failure", async () => {
    const failing = fakeProvider("currents", async () => ({ sources: [], error: "currents_http_500" }));
    const working = fakeProvider("newsdata", async () => ({ sources: goodCandidates("p5") }));

    const report = await retrieveValidatedSourcePack({
      requestId: "req_5",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers: [failing, working],
      now: NOW,
    });

    expect(report.finalStatus).toBe("PASS");
    expect(report.attempts[0]!.providerErrors.currents).toBe("currents_http_500");
  });

  it("skips an unconfigured provider without treating it as a hard failure", async () => {
    const unconfigured: SourceProvider = { name: "gdelt", isConfigured: () => false, search: vi.fn() };
    const working = fakeProvider("currents", async () => ({ sources: goodCandidates("p6") }));

    const report = await retrieveValidatedSourcePack({
      requestId: "req_6",
      topic: "Company X product update",
      keywords: ["Company X"],
      freshnessPolicy: "TODAY_ONLY",
      providers: [unconfigured, working],
      now: NOW,
    });

    expect(report.finalStatus).toBe("PASS");
    expect(unconfigured.search).not.toHaveBeenCalled();
    expect(report.attempts[0]!.providerErrors.gdelt).toBe("not_configured");
  });
});
