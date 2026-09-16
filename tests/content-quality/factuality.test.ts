import { describe, expect, it } from "vitest";
import { evaluateFactuality } from "@/lib/server/content-quality/factuality";
import { baseRequest } from "./fixtures";

describe("evaluateFactuality", () => {
  it("standard mode (default): never claims verification, never blocks", () => {
    const result = evaluateFactuality(baseRequest());
    expect(result.status).toBe("STANDARD_UNVERIFIED");
    expect(result.failedChecks).toHaveLength(0);
    expect(result.warnings.some((w) => /not been independently fact-checked/i.test(w))).toBe(true);
  });

  it("does not claim any AI-detection or verification percentage anywhere in its output", () => {
    const result = evaluateFactuality(baseRequest());
    const allText = [...result.warnings, ...result.failedChecks.map((f) => f.message)].join(" ");
    expect(allText).not.toMatch(/AI[- ]?(probability|detected|undetectable)/i);
    expect(allText).not.toMatch(/100% (human|verified)/i);
  });

  it('"verified" mode fails honestly rather than fabricating verification, since no source-retrieval exists', () => {
    const result = evaluateFactuality(baseRequest({ factualityMode: "verified" }));
    expect(result.status).toBe("VERIFICATION_UNAVAILABLE");
    expect(result.failedChecks).toEqual([
      expect.objectContaining({ code: "FACTUALITY_UNVERIFIED", severity: "blocking" }),
    ]);
  });
});
