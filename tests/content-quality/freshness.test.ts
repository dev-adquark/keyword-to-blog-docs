import { describe, expect, it } from "vitest";
import { evaluateFreshness, isFreshnessSensitive } from "@/lib/server/content-quality/freshness";
import { baseRequest, goodPost } from "./fixtures";

const NONE = { groundedInSearch: false, groundedInTodaySource: false };
const SEARCHED_BUT_STALE = { groundedInSearch: true, groundedInTodaySource: false };
const TODAY = { groundedInSearch: true, groundedInTodaySource: true };

describe("evaluateFreshness", () => {
  it("is not applicable for a normal evergreen topic, regardless of grounding", () => {
    const result = evaluateFreshness(baseRequest(), goodPost(), NONE);
    expect(result.status).toBe("NOT_APPLICABLE");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("blocks an unqualified current-state claim on a freshness-sensitive topic when no search was performed at all", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const post = goodPost({
      sections: [
        { type: "body", heading: "Cost", contentMarkdown: "The tool currently costs $29 per month for most users." },
      ],
    });
    const result = evaluateFreshness(request, post, NONE);
    expect(result.status).toBe("UNVERIFIED_BLOCKED");
    expect(result.failedChecks.some((f) => f.code === "UNGROUNDED_CURRENCY_CLAIM" && f.severity === "blocking")).toBe(
      true
    );
  });

  it("STILL blocks when a search was performed but nothing could be verified as published today (never yesterday-or-older)", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const post = goodPost({
      sections: [
        { type: "body", heading: "Cost", contentMarkdown: "The tool currently costs $29 per month for most users." },
      ],
    });
    const result = evaluateFreshness(request, post, SEARCHED_BUT_STALE);
    expect(result.status).toBe("UNVERIFIED_BLOCKED");
    expect(result.failedChecks.some((f) => f.code === "UNGROUNDED_CURRENCY_CLAIM")).toBe(true);
  });

  it("passes the same current-state claim only when the call returned a source verified as published TODAY", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const post = goodPost({
      sections: [
        { type: "body", heading: "Cost", contentMarkdown: "The tool currently costs $29 per month for most users." },
      ],
    });
    const result = evaluateFreshness(request, post, TODAY);
    expect(result.status).toBe("VERIFIED_CURRENT");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("does not flag a freshness-sensitive topic when the content avoids unqualified current-state claims", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const result = evaluateFreshness(request, goodPost(), NONE);
    expect(result.status).toBe("UNVERIFIED_ACCEPTABLE");
    expect(result.failedChecks).toHaveLength(0);
  });

  it("marks a freshness-sensitive topic with no current-state claims as VERIFIED_CURRENT when grounded in today's source", () => {
    const request = baseRequest({ keywords: ["software pricing"], topic: "software pricing" });
    const result = evaluateFreshness(request, goodPost(), TODAY);
    expect(result.status).toBe("VERIFIED_CURRENT");
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
