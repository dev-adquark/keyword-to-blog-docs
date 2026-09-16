import { describe, expect, it } from "vitest";
import { evaluateFreshness } from "@/lib/server/content-quality/freshness";
import { baseRequest, goodPost } from "./fixtures";

describe("evaluateFreshness", () => {
  it("is not applicable for a normal evergreen topic", () => {
    const result = evaluateFreshness(baseRequest(), goodPost());
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("detects a freshness-sensitive topic (pricing) and warns (does not block) on unqualified current-state claims", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const post = goodPost({
      sections: [
        { type: "body", heading: "Cost", contentMarkdown: "The tool currently costs $29 per month for most users." },
      ],
    });
    const result = evaluateFreshness(request, post);
    expect(result.status).toBe("UNVERIFIED_ACCEPTABLE");
    expect(result.failedChecks.some((f) => f.code === "FRESHNESS_UNVERIFIED" && f.severity === "warning")).toBe(true);
  });

  it("does not flag a freshness-sensitive topic when the content avoids unqualified current-state claims", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const result = evaluateFreshness(request, goodPost());
    expect(result.status).toBe("UNVERIFIED_ACCEPTABLE");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("blocks (rather than fabricates verification) when factualityMode is 'verified' on a freshness-sensitive topic with current claims", () => {
    const request = baseRequest({
      keywords: ["software pricing"],
      topic: "software pricing",
      factualityMode: "verified",
    });
    const post = goodPost({
      sections: [
        { type: "body", heading: "Cost", contentMarkdown: "The tool currently costs $29 per month for most users." },
      ],
    });
    const result = evaluateFreshness(request, post);
    expect(result.status).toBe("UNVERIFIED_BLOCKED");
    expect(result.failedChecks.some((f) => f.code === "FRESHNESS_UNVERIFIED" && f.severity === "blocking")).toBe(true);
  });
});
