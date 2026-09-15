import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/repository", () => ({
  getJobById: vi.fn(),
  claimJobForProcessing: vi.fn(),
  markJobSucceeded: vi.fn(async () => undefined),
  markJobFailed: vi.fn(async () => undefined),
  recordUsageEvent: vi.fn(async () => undefined),
  createWebhookDeliveryRecord: vi.fn(async () => ({ id: "whd_1" })),
  updateWebhookDeliveryRecord: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/generation/anthropic", () => ({
  getAIProvider: vi.fn(),
}));

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
const { getAIProvider } = await import("@/lib/server/generation/anthropic");
const { deliverWebhook } = await import("@/lib/server/webhooks");

const validPost = {
  title: "t",
  slugSuggestion: "t",
  meta: { description: "d", primaryKeyword: "kw" },
  outline: { h1: "H1", h2: ["a"] },
  sections: [{ type: "body", contentMarkdown: "some words here" }],
  conclusion: "the end",
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

    expect(getAIProvider).not.toHaveBeenCalled();
    expect(recordUsageEvent).not.toHaveBeenCalled();
  });

  it("on success: records 1 post + real word count, and sends a flat job.succeeded payload matching the documented shape", async () => {
    const job = baseJob();
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(getAIProvider).mockReturnValue({ generate: vi.fn(async () => validPost) } as never);

    await processJob("job_1");

    expect(recordUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, posts: 1, words: 3 })
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
    vi.mocked(getAIProvider).mockReturnValue({
      generate: vi.fn(async () => {
        throw new Error("boom");
      }),
    } as never);

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

  it("does not send a webhook for an event the customer didn't subscribe to", async () => {
    const job = baseJob({ webhook_events: ["job.failed"] });
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(getAIProvider).mockReturnValue({ generate: vi.fn(async () => validPost) } as never);

    await processJob("job_1");

    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it("does not attempt a webhook when no webhook is configured on the job", async () => {
    const job = baseJob({ webhook_url: null, webhook_secret: null });
    vi.mocked(claimJobForProcessing).mockResolvedValue(job as never);
    vi.mocked(getJobById).mockResolvedValue(job as never);
    vi.mocked(getAIProvider).mockReturnValue({ generate: vi.fn(async () => validPost) } as never);

    await processJob("job_1");

    expect(deliverWebhook).not.toHaveBeenCalled();
    expect(createWebhookDeliveryRecord).not.toHaveBeenCalled();
  });
});
