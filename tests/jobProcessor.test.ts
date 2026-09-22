import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/repository", () => ({
  getJobById: vi.fn(),
  claimJobForProcessing: vi.fn(),
  markJobSucceeded: vi.fn(async () => undefined),
  markJobFailed: vi.fn(async () => undefined),
  recordUsageEvent: vi.fn(async () => undefined),
  recordContentQualityReport: vi.fn(async () => undefined),
  createWebhookDeliveryRecord: vi.fn(async () => ({ id: "whd_1" })),
  updateWebhookDeliveryRecord: vi.fn(async () => undefined),
}));

// jobProcessor's job is to wire generation → quality pipeline → persistence →
// webhooks correctly — NOT to re-verify quality-check behavior (that has its
// own dedicated tests under tests/content-quality/). Mock the pipeline
// itself so this file only exercises the wiring.
vi.mock("@/lib/server/content-quality/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/content-quality/engine")>();
  return {
    ContentQualityFailedError: actual.ContentQualityFailedError,
    runContentQualityPipeline: vi.fn(),
    toQualitySummary: vi.fn(() => ({ status: "pass", score: 90, revisionCount: 0, qualityVersion: "1.0.0" })),
  };
});

vi.mock("@/lib/server/webhooks", () => ({
  deliverWebhook: vi.fn(async () => ({ attempted: true, delivered: true, attempts: 1, lastStatusCode: 200 })),
}));

const { processJob } = await import("@/lib/server/jobProcessor");
const {
  getJobById,
  claimJobForProcessing,
  markJobSucceeded,
  markJobFailed,
  recordUsageEvent,
  createWebhookDeliveryRecord,
  updateWebhookDeliveryRecord,
} = await import("@/lib/server/repository");
const { runContentQualityPipeline } = await import("@/lib/server/content-quality/engine");
const { deliverWebhook } = await import("@/lib/server/webhooks");

const validPost = {
  title: "t",
  slugSuggestion: "t",
  meta: { description: "d", primaryKeyword: "kw" },
  outline: { h1: "H1", h2: ["a"] },
  sections: [{ type: "body", contentMarkdown: "some words here" }],
  conclusion: "the end",
};

const passingReport = {
  qualityVersion: "1.0.0",
  overallStatus: "PASS",
  overallScore: 90,
  writingScore: 90,
  originalityScore: 90,
  depthScore: 90,
  seoScore: 90,
  readabilityScore: 90,
  keywordScore: 90,
  structureScore: 90,
  factualityStatus: "STANDARD_UNVERIFIED",
  freshnessStatus: "NOT_APPLICABLE",
  wordCount: 3,
  keywordCoverage: 1,
  revisionCount: 0,
  passedChecks: [],
  failedChecks: [],
  warnings: [],
  revisionReasons: [],
};

function baseJob(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job_1",
    customer_id: "cus_1",
    api_key_id: "key_1",
    status: "processing",
    request_id: "req_1",
    input: {
      keywords: ["a"],
      language: "en",
      tone: "professional",
      constraints: { maxWords: 500 },
      format: { responseTypes: ["markdown"] },
    },
    webhook_url: "https://example.com/hook",
    webhook_events: ["job.succeeded", "job.failed"],
    webhook_secret: "secret",
    result: null,
    rendered: null,
    quality: null,
    error_code: null,
    error_message: null,
    idempotency_key: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("processJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing if the job was already claimed (atomic claim guards against double-processing)", async () => {
    vi.mocked(claimJobForProcessing).mockResolvedValue(null);
    vi.mocked(getJobById).mockResolvedValue(baseJob({ status: "processing" }) as never);

    await processJob("job_1");

    expect(runContentQualityPipeline).not.toHaveBeenCalled();
    expect(recordUsageEvent).not.toHaveBeenCalled();
  });

  it("on success: records 1 post + real word count, and sends a flat job.succeeded payload matching the documented shape", async () => {
    const job = baseJob();
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(runContentQualityPipeline).mockResolvedValue({ post: validPost, report: passingReport } as never);

    await processJob("job_1");

    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, posts: 1, words: 5 })
    );
    expect(markJobSucceeded).toHaveBeenCalled();
    expect(createWebhookDeliveryRecord).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job_1", event: "job.succeeded" })
    );
    expect(deliverWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          event: "job.succeeded",
          jobId: "job_1",
          requestId: "req_1",
          post: expect.any(Object),
          rendered: expect.any(Object),
        }),
      })
    );
    expect(updateWebhookDeliveryRecord).toHaveBeenCalledWith(
      "whd_1",
      expect.objectContaining({ status: "delivered" })
    );
  });

  it("on failure: records posts: 0 and sends a flat job.failed payload with the real error code", async () => {
    const job = baseJob();
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(runContentQualityPipeline).mockRejectedValue(new Error("boom"));

    await processJob("job_1");

    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, posts: 0, words: 0 })
    );
    expect(markJobFailed).toHaveBeenCalledWith("job_1", "INTERNAL_ERROR", expect.any(String));
    expect(deliverWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          event: "job.failed",
          jobId: "job_1",
          requestId: "req_1",
          error: expect.objectContaining({ code: "INTERNAL_ERROR" }),
        }),
      })
    );
  });

  it("REGRESSION (async path): rendered markdown never contains the conclusion twice, even when the pipeline returns a redundant conclusion-type section", async () => {
    const job = baseJob();
    const postWithRedundantConclusionSection = {
      ...validPost,
      sections: [
        ...validPost.sections,
        { type: "conclusion", heading: "Wrapping Up", contentMarkdown: "A separate section-level closing statement." },
      ],
      conclusion: "The canonical closing statement.",
    };
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(runContentQualityPipeline).mockResolvedValue({
      post: postWithRedundantConclusionSection,
      report: passingReport,
    } as never);

    await processJob("job_1");

    const webhookCall = vi.mocked(deliverWebhook).mock.calls[0]?.[0] as unknown as {
      payload: { rendered: { markdown: string } };
    };
    const markdown = webhookCall.payload.rendered.markdown;
    expect(markdown).toContain("The canonical closing statement.");
    expect(markdown).not.toContain("A separate section-level closing statement.");
    expect(markdown.split("The canonical closing statement.").length - 1).toBe(1);
  });

  it("does not send a webhook for an event the customer didn't subscribe to", async () => {
    const job = baseJob({ webhook_events: ["job.failed"] });
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(runContentQualityPipeline).mockResolvedValue({ post: validPost, report: passingReport } as never);

    await processJob("job_1");

    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it("does not attempt a webhook when no webhook is configured on the job", async () => {
    const job = baseJob({ webhook_url: null, webhook_secret: null });
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(runContentQualityPipeline).mockResolvedValue({ post: validPost, report: passingReport } as never);

    await processJob("job_1");

    expect(deliverWebhook).not.toHaveBeenCalled();
    expect(createWebhookDeliveryRecord).not.toHaveBeenCalled();
  });
});
