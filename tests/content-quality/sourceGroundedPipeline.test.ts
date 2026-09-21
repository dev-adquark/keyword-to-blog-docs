import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SourcePack, SourceRetrievalReport } from "@/lib/types";
import { goodPost, baseRequest } from "./fixtures";

vi.mock("@/lib/server/sources/retrieve", () => ({
  retrieveValidatedSourcePack: vi.fn(),
}));
vi.mock("@/lib/server/generation/rewriter", () => ({
  rewriteFromSourcePack: vi.fn(),
}));

const { runSourceGroundedPipeline, SourceValidationFailedError } = await import(
  "@/lib/server/content-quality/sourceGroundedPipeline"
);
const { ContentQualityFailedError } = await import("@/lib/server/content-quality/pipelineResult");
const { retrieveValidatedSourcePack } = await import("@/lib/server/sources/retrieve");
const { rewriteFromSourcePack } = await import("@/lib/server/generation/rewriter");

function sourcePack(overrides: Partial<SourcePack> = {}): SourcePack {
  return {
    topic: "strong password",
    keywords: ["strong password"],
    contentType: "blog",
    freshnessPolicy: "TODAY_ONLY",
    validatedAt: new Date().toISOString(),
    status: "PASS",
    sources: [
      {
        provider: "currents",
        sourceId: "s1",
        title: "Real source title",
        description: "Real description",
        content: null,
        url: "https://example.com/real-source",
        publisher: "example.com",
        publishedAt: new Date().toISOString(),
        retrievedAt: new Date().toISOString(),
        language: "en",
        category: null,
        author: null,
        country: null,
      },
    ],
    approvedClaims: [{ claim: "Real source title", supportedBy: ["s1"] }],
    excludedClaims: [],
    rejectedSources: [],
    providerCount: 2,
    independentPublisherCount: 2,
    failureReasons: [],
    ...overrides,
  };
}

function passingReport(pack: SourcePack): SourceRetrievalReport {
  return {
    requestId: "req_1",
    topic: pack.topic,
    freshnessPolicy: pack.freshnessPolicy,
    attempts: [{ attempt: 1, query: pack.topic, providersQueried: ["currents"], providerErrors: {}, candidatesRetrieved: 2, candidatesApproved: 1, result: "PASS" }],
    finalStatus: "PASS",
    sourcePack: pack,
  };
}

function failingReport(): SourceRetrievalReport {
  return {
    requestId: "req_1",
    topic: "strong password",
    freshnessPolicy: "TODAY_ONLY",
    attempts: [1, 2, 3].map((attempt) => ({
      attempt,
      query: "strong password",
      providersQueried: ["currents"],
      providerErrors: {},
      candidatesRetrieved: 0,
      candidatesApproved: 0,
      result: "FAIL" as const,
    })),
    finalStatus: "FAIL",
    sourcePack: null,
  };
}

describe("runSourceGroundedPipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("never calls Anthropic (0 calls) when source retrieval/validation fails after 3 attempts", async () => {
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(failingReport());

    await expect(runSourceGroundedPipeline(baseRequest(), "req_1")).rejects.toBeInstanceOf(SourceValidationFailedError);
    expect(rewriteFromSourcePack).not.toHaveBeenCalled();
  });

  it("uses a rolling 7-day freshness window, not 'published today only'", async () => {
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(failingReport());
    await runSourceGroundedPipeline(baseRequest(), "req_1").catch(() => {});

    expect(retrieveValidatedSourcePack).toHaveBeenCalledWith(expect.objectContaining({ freshnessPolicy: "LAST_7_DAYS" }));
  });

  it("makes exactly ONE Anthropic call and publishes when the source pack passes and the rewrite is valid", async () => {
    const pack = sourcePack();
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(passingReport(pack));
    vi.mocked(rewriteFromSourcePack).mockResolvedValue(
      goodPost({ sources: [{ title: "Real source title", url: "https://example.com/real-source", publishedAt: pack.sources[0]!.publishedAt }] })
    );

    const { report } = await runSourceGroundedPipeline(baseRequest(), "req_1");

    expect(report.overallStatus).toBe("PASS");
    expect(report.freshnessStatus).toBe("VERIFIED_CURRENT");
    expect(report.factualityStatus).toBe("VERIFIED");
    expect(report.revisionCount).toBe(0);
    expect(rewriteFromSourcePack).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: factualityMode 'verified' no longer falsely blocks a successful source-grounded generation — real source-retrieval now exists and was actually used", async () => {
    const pack = sourcePack();
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(passingReport(pack));
    vi.mocked(rewriteFromSourcePack).mockResolvedValue(
      goodPost({ sources: [{ title: "Real source title", url: "https://example.com/real-source", publishedAt: pack.sources[0]!.publishedAt }] })
    );

    const { report } = await runSourceGroundedPipeline(baseRequest({ factualityMode: "verified" }), "req_1");
    expect(report.overallStatus).toBe("PASS");
    expect(report.factualityStatus).toBe("VERIFIED");
  });

  it("fails closed (never a second Anthropic call) when the rewrite cites a URL not in the source pack", async () => {
    const pack = sourcePack();
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(passingReport(pack));
    vi.mocked(rewriteFromSourcePack).mockResolvedValue(
      goodPost({ sources: [{ title: "Fabricated", url: "https://not-real.example.com/x", publishedAt: null }] })
    );

    await expect(runSourceGroundedPipeline(baseRequest(), "req_1")).rejects.toBeInstanceOf(ContentQualityFailedError);
    expect(rewriteFromSourcePack).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the rewrite cites no sources at all", async () => {
    const pack = sourcePack();
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(passingReport(pack));
    vi.mocked(rewriteFromSourcePack).mockResolvedValue(goodPost({ sources: undefined }));

    try {
      await runSourceGroundedPipeline(baseRequest(), "req_1");
      throw new Error("expected pipeline to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContentQualityFailedError);
      const failure = err as InstanceType<typeof ContentQualityFailedError>;
      expect(failure.report.failedChecks.some((f) => f.code === "MISSING_SOURCE_ATTRIBUTION")).toBe(true);
    }
    expect(rewriteFromSourcePack).toHaveBeenCalledTimes(1);
  });

  it("still makes only ONE Anthropic call even when a free mechanical fix is needed to pass", async () => {
    const pack = sourcePack();
    vi.mocked(retrieveValidatedSourcePack).mockResolvedValue(passingReport(pack));
    vi.mocked(rewriteFromSourcePack).mockResolvedValue(
      goodPost({
        title: "Strong Password Security Practices: A Guide for 2024",
        sources: [{ title: "Real source title", url: "https://example.com/real-source", publishedAt: pack.sources[0]!.publishedAt }],
      })
    );

    const { post, report } = await runSourceGroundedPipeline(baseRequest(), "req_1");

    expect(report.overallStatus).toBe("PASS");
    expect(post.title).not.toMatch(/\b(19|20)\d{2}\b/); // the free mechanical pass strips the stray year
    expect(rewriteFromSourcePack).toHaveBeenCalledTimes(1);
  });
});
