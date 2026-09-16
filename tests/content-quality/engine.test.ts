import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/lib/server/generation/provider";
import { baseRequest, goodPost } from "./fixtures";

// The LLM evaluator makes a real network call in production — mock it here
// so this test is fully offline/deterministic and exercises the
// deterministic-validator-driven revision loop specifically.
vi.mock("@/lib/server/content-quality/llmEvaluator", () => ({
  runLLMEvaluator: vi.fn(async () => ({
    available: false,
    usefulnessScore: null,
    depthScore: null,
    searchIntentMatchScore: null,
    naturalWritingScore: null,
    originalityOfIdeasScore: null,
    factualPlausibilityScore: null,
    concerns: [],
  })),
}));

const { runContentQualityPipeline, ContentQualityFailedError } = await import("@/lib/server/content-quality/engine");

const badPost = () =>
  goodPost({
    title: "Passwords",
    sections: [
      {
        type: "introduction",
        contentMarkdown: "In today's digital landscape, security matters more than ever for everyone involved.",
      },
    ],
  });

function fakeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    generate: vi.fn(async () => badPost()),
    revise: vi.fn(async () => badPost()),
    ...overrides,
  };
}

describe("runContentQualityPipeline (integration)", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("passes immediately when the first generation is already good — no revision call at all", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => goodPost()) });

    const { post, report } = await runContentQualityPipeline(baseRequest(), provider);

    expect(report.overallStatus).toBe("PASS");
    expect(report.revisionCount).toBe(0);
    expect(post.title).toBe(goodPost().title);
    expect(provider.revise).not.toHaveBeenCalled();
  });

  it("initial generation FAILS quality, revision PASSES — the caller only ever receives the revised, validated content", async () => {
    const provider = fakeProvider({
      generate: vi.fn(async () => badPost()),
      revise: vi.fn(async () => goodPost()),
    });

    const { post, report } = await runContentQualityPipeline(baseRequest(), provider);

    expect(report.overallStatus).toBe("PASS");
    expect(report.revisionCount).toBe(1);
    // The bad first draft's distinguishing title must never leak into the response.
    expect(post.title).not.toBe(badPost().title);
    expect(post.title).toBe(goodPost().title);
    expect(provider.revise).toHaveBeenCalledTimes(1);

    const revisionCallArgs = vi.mocked(provider.revise).mock.calls[0]?.[0];
    expect(revisionCallArgs?.feedback.failedChecks.some((f) => f.code === "GENERIC_INTRO")).toBe(true);
    expect(revisionCallArgs?.previous.title).toBe(badPost().title);
  });

  it("exhausts the configured revision limit and throws CONTENT_QUALITY_FAILED rather than returning bad content", async () => {
    vi.stubEnv("CONTENT_QUALITY_MAX_REVISIONS", "1");
    const provider = fakeProvider({
      generate: vi.fn(async () => badPost()),
      revise: vi.fn(async () => badPost()), // revision never actually fixes anything
    });

    await expect(runContentQualityPipeline(baseRequest(), provider)).rejects.toBeInstanceOf(
      ContentQualityFailedError
    );
    expect(provider.revise).toHaveBeenCalledTimes(1);
  });

  it("the thrown error carries the full internal report (for DB persistence) but a minimal public details payload", async () => {
    vi.stubEnv("CONTENT_QUALITY_MAX_REVISIONS", "0");
    const provider = fakeProvider({ generate: vi.fn(async () => badPost()) });

    try {
      await runContentQualityPipeline(baseRequest(), provider);
      throw new Error("expected the pipeline to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContentQualityFailedError);
      const failure = err as InstanceType<typeof ContentQualityFailedError>;
      expect(failure.code).toBe("CONTENT_QUALITY_FAILED");
      expect(failure.report.failedChecks.some((f) => f.code === "GENERIC_INTRO")).toBe(true);
      // Public details are curated — codes only, never full messages/scores breakdown.
      expect(failure.details?.failedCheckCodes).toContain("GENERIC_INTRO");
      expect(failure.details?.failedChecks).toBeUndefined();
    }
  });

  it("never lets factualityMode: 'verified' pass, and never burns a revision attempt trying to fix it", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => goodPost()) });

    await expect(
      runContentQualityPipeline(baseRequest({ factualityMode: "verified" }), provider)
    ).rejects.toBeInstanceOf(ContentQualityFailedError);
    // Unfixable by definition — revising the wording can't grant source-retrieval capability.
    expect(provider.revise).not.toHaveBeenCalled();
  });
});
