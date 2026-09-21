import { describe, expect, it } from "vitest";
import { buildEvidenceMap } from "@/lib/server/sources/evidence";
import { normalizedSource } from "./fixtures";

describe("buildEvidenceMap", () => {
  it("treats a single, unclustered source as its own approved claim", () => {
    const source = normalizedSource({ title: "Company X announces major product update today" });
    const { approvedClaims, excludedClaims } = buildEvidenceMap([source]);
    expect(approvedClaims).toHaveLength(1);
    expect(approvedClaims[0]!.supportedBy).toEqual([source.sourceId]);
    expect(excludedClaims).toHaveLength(0);
  });

  it("corroborates two sources covering the same story with agreeing figures", () => {
    const a = normalizedSource({ sourceId: "a", title: "Company X reports 25% revenue growth this quarter", description: "Revenue grew 25% year over year." });
    const b = normalizedSource({ sourceId: "b", title: "Company X sees 25% revenue growth in latest quarter", description: "The 25% growth beat analyst expectations." });
    const { approvedClaims, excludedClaims } = buildEvidenceMap([a, b]);
    expect(excludedClaims).toHaveLength(0);
    expect(approvedClaims.some((c) => c.supportedBy.includes("a") && c.supportedBy.includes("b"))).toBe(true);
  });

  it("excludes a claim when sources covering the same story report non-overlapping figures", () => {
    const a = normalizedSource({ sourceId: "a", title: "Company X reports quarterly revenue growth", description: "Revenue grew 25% year over year, the company said." });
    const b = normalizedSource({ sourceId: "b", title: "Company X reports quarterly revenue growth", description: "Revenue grew 40% year over year, according to the filing." });
    const { approvedClaims, excludedClaims } = buildEvidenceMap([a, b]);
    expect(excludedClaims).toHaveLength(1);
    expect(excludedClaims[0]!.conflictingSourceIds).toEqual(["a", "b"]);
    expect(approvedClaims).toHaveLength(0);
  });

  it("REGRESSION: does not falsely cluster (and therefore never falsely conflict-excludes) two genuinely different stories that only share broad topic/filler words", () => {
    // Two real, unrelated stock-market stories from the same day — sharing
    // "stock", "market", "today" etc. was enough to cluster them under the
    // old raw-Jaccard comparison, which could then spuriously flag them as
    // "conflicting" (different numbers) even though they're about entirely
    // different events.
    const a = normalizedSource({
      sourceId: "a",
      title: "Stock Market Today: S&P 500, Nasdaq 100 Futures Gain as Trump Issues Fresh Warning to Iran",
      description: "U.S. futures rose 0.5% this morning as investors weighed geopolitical developments.",
    });
    const b = normalizedSource({
      sourceId: "b",
      title: "Sensex jumps 690 pts intraday, Nifty tops 23,400: 4 factors behind mkt rise",
      description: "Indian markets rallied on strong foreign inflows and easing crude oil prices.",
    });
    const { approvedClaims, excludedClaims } = buildEvidenceMap([a, b]);
    expect(excludedClaims).toHaveLength(0);
    expect(approvedClaims).toHaveLength(2); // two separate, independent claims — never merged, never conflicted
  });

  it("does not flag a conflict when only one source in the cluster cites a number", () => {
    const a = normalizedSource({ sourceId: "a", title: "Company X reports quarterly revenue growth", description: "Revenue grew 25% year over year." });
    const b = normalizedSource({ sourceId: "b", title: "Company X reports quarterly revenue growth", description: "The company says results beat expectations." });
    const { excludedClaims } = buildEvidenceMap([a, b]);
    expect(excludedClaims).toHaveLength(0);
  });
});
