import { describe, expect, it } from "vitest";
import { evaluateFreshness, isFreshnessSensitive } from "@/lib/server/content-quality/freshness";
import { baseRequest, goodPost } from "./fixtures";

describe("evaluateFreshness (evergreen-pipeline backstop)", () => {
  it("is not applicable for a normal evergreen topic", () => {
    const result = evaluateFreshness(baseRequest(), goodPost());
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("ALWAYS blocks a freshness-sensitive topic — this pipeline has no source-retrieval capability, so it can never legitimately pass one", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const result = evaluateFreshness(request, goodPost());
    expect(result.status).toBe("UNVERIFIED_BLOCKED");
    expect(result.failedChecks.some((f) => f.code === "UNGROUNDED_CURRENCY_CLAIM" && f.severity === "blocking")).toBe(
      true
    );
  });
});

describe("isFreshnessSensitive", () => {
  it("detects common time-sensitive topic signals", () => {
    expect(isFreshnessSensitive(baseRequest({ topic: "latest smartphone releases" }))).toBe(true);
    expect(isFreshnessSensitive(baseRequest({ keywords: ["breaking news today"] }))).toBe(true);
  });

  it("does not flag a stable, evergreen topic", () => {
    expect(isFreshnessSensitive(baseRequest({ topic: "how to choose a strong password", keywords: ["strong password"] }))).toBe(
      false
    );
  });
});
