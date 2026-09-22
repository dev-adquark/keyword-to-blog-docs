import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/withApiAuth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  createJobRow: vi.fn(),
  getJobById: vi.fn(),
  markJobFailed: vi.fn(async () => undefined),
  claimIdempotencyRequest: vi.fn(),
  updateIdempotencyRecord: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/webhooks", () => ({
  generateWebhookSecret: vi.fn(() => "whsec_test"),
}));

vi.mock("@/lib/server/qstash", () => ({
  publishJobProcessingMessage: vi.fn(async () => undefined),
  qstashConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/server/jobProcessor", () => ({
  processJob: vi.fn(async () => undefined),
}));

const { POST } = await import("@/app/api/v1/jobs/route");
const { authenticate } = await import("@/lib/server/withApiAuth");
const { createJobRow, getJobById, claimIdempotencyRequest } = await import("@/lib/server/repository");
const { processJob } = await import("@/lib/server/jobProcessor");

const validBody = {
  generateRequest: {
    keywords: ["a"],
    language: "en",
    tone: "professional",
    constraints: { maxWords: 500 },
    format: { responseTypes: ["json"] },
  },
  format: { responseTypes: ["json"] },
};

function jobsRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/v1/jobs", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function fakeJobRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "job_1",
    customer_id: "cus_1",
    api_key_id: "key_1",
    status: "queued",
    request_id: "req_1",
    input: validBody.generateRequest,
    webhook_url: null,
    webhook_events: [],
    webhook_secret: null,
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

describe("POST /v1/jobs idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockResolvedValue({
      ok: true,
      context: {
        requestId: "req_1",
        apiKey: { id: "key_1" } as never,
        customer: { id: "cus_1" } as never,
        plan: { maxWordsPerRequest: 1500, maxConcurrentJobs: 1, id: "starter" } as never,
      },
      rateLimitHeaders: {},
    });
  });

  it("creates exactly one job on the first request with an idempotency key", async () => {
    vi.mocked(claimIdempotencyRequest).mockResolvedValue({ claimed: true, existing: null });
    vi.mocked(createJobRow).mockResolvedValue(fakeJobRow() as never);
    vi.mocked(getJobById).mockResolvedValue(fakeJobRow() as never);

    const res = await POST(jobsRequest({ ...validBody, idempotencyKey: "idem-key-1" }));

    expect(res.status).toBe(202);
    expect(createJobRow).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: this engine does not enforce a plan/tier-based word cap — a request explicitly asking for MORE words than the plan's maxWordsPerRequest still succeeds", async () => {
    vi.mocked(claimIdempotencyRequest).mockResolvedValue({ claimed: true, existing: null });
    vi.mocked(createJobRow).mockResolvedValue(fakeJobRow() as never);
    vi.mocked(getJobById).mockResolvedValue(fakeJobRow() as never);

    const body = {
      generateRequest: { ...validBody.generateRequest, constraints: { maxWords: 5000 } }, // exceeds plan's 1500 cap on purpose
      format: { responseTypes: ["json"] },
    };
    const res = await POST(jobsRequest(body));

    expect(res.status).toBe(202);
    expect(createJobRow).toHaveBeenCalledTimes(1);
  });

  it("does NOT create a second job for a replayed idempotency key with the same body — the real billing-duplication bug this closes", async () => {
    const storedResponse = { jobId: "job_1", status: "queued" };
    vi.mocked(claimIdempotencyRequest).mockResolvedValue({
      claimed: false,
      existing: {
        request_hash: "will-be-overridden-by-hash-check",
        response: storedResponse,
        status_code: 202,
      },
    });

    // The route computes its own request hash from the body and compares it
    // to `existing.request_hash` — mock claimIdempotencyRequest to return a
    // hash that matches by reading it back from the call args.
    vi.mocked(claimIdempotencyRequest).mockImplementation(async (params) => ({
      claimed: false,
      existing: { request_hash: params.requestHash, response: storedResponse, status_code: 202 },
    }));

    const res = await POST(jobsRequest({ ...validBody, idempotencyKey: "idem-key-2" }));
    const body = await res.json();

    expect(res.status).toBe(202);
    expect(body).toEqual(storedResponse);
    expect(createJobRow).not.toHaveBeenCalled();
    expect(processJob).not.toHaveBeenCalled();
  });

  it("rejects a replayed idempotency key used with a different request body", async () => {
    vi.mocked(claimIdempotencyRequest).mockResolvedValue({
      claimed: false,
      existing: { request_hash: "some-other-hash", response: {}, status_code: 202 },
    });

    const res = await POST(jobsRequest({ ...validBody, idempotencyKey: "idem-key-3" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toMatch(/already used with a different request body/i);
    expect(createJobRow).not.toHaveBeenCalled();
  });

  it("creates a job normally when no idempotency key is provided", async () => {
    vi.mocked(createJobRow).mockResolvedValue(fakeJobRow() as never);
    vi.mocked(getJobById).mockResolvedValue(fakeJobRow() as never);

    const res = await POST(jobsRequest(validBody));

    expect(res.status).toBe(202);
    expect(claimIdempotencyRequest).not.toHaveBeenCalled();
    expect(createJobRow).toHaveBeenCalledTimes(1);
  });
});
