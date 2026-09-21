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

  it("does not flag a conflict when only one source in the cluster cites a number", () => {
    const a = normalizedSource({ sourceId: "a", title: "Company X reports quarterly revenue growth", description: "Revenue grew 25% year over year." });
    const b = normalizedSource({ sourceId: "b", title: "Company X reports quarterly revenue growth", description: "The company says results beat expectations." });
    const { excludedClaims } = buildEvidenceMap([a, b]);
    expect(excludedClaims).toHaveLength(0);
  });
});
