import { describe, expect, it } from "vitest";
import { evaluateSourceOriginality } from "@/lib/server/content-quality/sourceOriginality";
import { goodPost } from "./fixtures";
import type { NormalizedSource, SourcePack } from "@/lib/types";

function source(overrides: Partial<NormalizedSource> = {}): NormalizedSource {
  return {
    provider: "currents",
    sourceId: "s1",
    title: "Acme Robotics reports strong quarterly revenue",
    description: "",
    content: null,
    url: "https://example.com/source",
    publisher: "example.com",
    publishedAt: new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    language: "en",
    category: null,
    author: null,
    country: null,
    ...overrides,
  };
}

const SOURCE_1_TEXT =
  "Acme Robotics today announced that its quarterly revenue climbed to $420 million, driven primarily by strong demand for its warehouse automation systems in North America and Europe. The company's chief executive told investors that order backlogs have grown for six consecutive quarters, and that the firm expects continued growth into next year.";

const SOURCE_2_TEXT =
  "Acme Robotics also unveiled a new generation of its flagship sorting robot at a trade conference in Berlin this week, claiming a 30 percent improvement in throughput over the previous model. Industry analysts said the upgrade could pressure smaller competitors who have struggled to match the company's pace of innovation in recent years.";

function pack(sources: NormalizedSource[]): SourcePack {
  return {
    topic: "Acme Robotics",
    keywords: ["Acme Robotics"],
    contentType: "blog",
    freshnessPolicy: "LAST_7_DAYS",
    validatedAt: new Date().toISOString(),
    status: "PASS",
    sources,
    approvedClaims: [],
    excludedClaims: [],
    rejectedSources: [],
    providerCount: sources.length,
    independentPublisherCount: sources.length,
    failureReasons: [],
  };
}

function postWithBody(text: string) {
  return goodPost({
    sections: [
      { type: "introduction", contentMarkdown: "Acme Robotics had an eventful week, with news spanning both its financial results and its product lineup." },
      { type: "body", heading: "The latest", contentMarkdown: text },
    ],
  });
}

describe("evaluateSourceOriginality", () => {
  it("1. PASSES a clearly original article that synthesizes the source facts in fresh wording", () => {
    const post = postWithBody(
      "Acme Robotics posted a strong quarter, with revenue reaching $420 million as more warehouses across North America and Europe adopted its automation systems. Executives pointed to six straight quarters of backlog growth as evidence that demand shows no sign of slowing. The company also used a recent industry event in Berlin to introduce an upgraded sorting robot, which it says moves packages roughly 30 percent faster than its predecessor — a leap that could squeeze rivals still catching up to Acme's pace of development."
    );
    const result = evaluateSourceOriginality(post, pack([source({ sourceId: "s1", description: SOURCE_1_TEXT }), source({ sourceId: "s2", description: SOURCE_2_TEXT })]));
    expect(result.failedChecks).toHaveLength(0);
  });

  it("2. FAILS on a directly copied sentence (verbatim, 20+ words) from the source", () => {
    const post = postWithBody(
      `Here's what happened this week. ${SOURCE_1_TEXT.split(". ")[1]}. That's a notable milestone for the company.`
    );
    const result = evaluateSourceOriginality(post, pack([source({ sourceId: "s1", description: SOURCE_1_TEXT })]));
    expect(result.failedChecks.some((f) => f.code === "SOURCE_TEXT_COPIED")).toBe(true);
  });

  it("3. FAILS on a closely (shallow, synonym-swapped) paraphrased paragraph that keeps most of the source's exact wording", () => {
    const closelyParaphrased =
      "Acme Robotics also unveiled a new generation of its flagship sorting robot at a trade conference in Berlin this week, claiming a 30 percent boost in throughput over the earlier model. Analysts in the industry said the upgrade could pressure smaller rivals who have struggled to match the firm's pace of innovation in recent years.";
    const post = postWithBody(closelyParaphrased);
    const result = evaluateSourceOriginality(post, pack([source({ sourceId: "s2", description: SOURCE_2_TEXT })]));
    expect(result.failedChecks.some((f) => f.code === "SOURCE_TEXT_COPIED")).toBe(true);
  });

  it("4. PASSES normal, unavoidable factual overlap — shared names, numbers, and dates alone are never flagged", () => {
    const post = postWithBody(
      "Investors reacted positively after Acme Robotics shared its results this week. The headline figure that caught attention was $420 million, a number that comfortably beat what most analysts had penciled in for the period. Meanwhile, the unveiling in Berlin drew plenty of trade-press attention too, with the 30 percent figure quickly becoming the talking point of the show floor for the rest of the week."
    );
    const result = evaluateSourceOriginality(post, pack([source({ sourceId: "s1", description: SOURCE_1_TEXT }), source({ sourceId: "s2", description: SOURCE_2_TEXT })]));
    expect(result.failedChecks).toHaveLength(0);
  });

  it("5. PASSES a multi-source synthesized article that combines both stories into one fresh narrative", () => {
    const post = postWithBody(
      "It was a big week for Acme Robotics on two fronts. On the financial side, the firm's revenue climbed to $420 million, with demand for its warehouse systems continuing to build across two continents and order backlogs stretching out further than at any point in the past year and a half. On the product side, the company used a trade show appearance in Germany to pull the wrapper off its next sorting robot, promising meaningfully faster package handling than the model it replaces — a claim that has rivals in the space paying close attention."
    );
    const result = evaluateSourceOriginality(post, pack([source({ sourceId: "s1", description: SOURCE_1_TEXT }), source({ sourceId: "s2", description: SOURCE_2_TEXT })]));
    expect(result.failedChecks).toHaveLength(0);
  });

  it("passes when there are no sources at all (nothing to compare against)", () => {
    const result = evaluateSourceOriginality(goodPost(), pack([]));
    expect(result.failedChecks).toHaveLength(0);
    expect(result.score).toBe(100);
  });

  it("reports the matched phrase and source index in the failure message", () => {
    const post = postWithBody(SOURCE_1_TEXT);
    const result = evaluateSourceOriginality(post, pack([source({ sourceId: "s1", description: SOURCE_1_TEXT })]));
    const failure = result.failedChecks.find((f) => f.code === "SOURCE_TEXT_COPIED");
    expect(failure).toBeDefined();
    expect(failure!.message).toMatch(/source #0/);
  });
});
