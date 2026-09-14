import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/withApiAuth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  getJobById: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock("@/lib/server/auth", () => ({
  requireSession: vi.fn(),
}));

const { authenticate } = await import("@/lib/server/withApiAuth");
const { getJobById, revokeApiKey } = await import("@/lib/server/repository");
const { requireSession } = await import("@/lib/server/auth");
const { GET: getJob } = await import("@/app/api/v1/jobs/[jobId]/route");
const { POST: revokeKey } = await import("@/app/api/dashboard/api-keys/[id]/revoke/route");

describe("cross-tenant (IDOR) protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /v1/jobs/:jobId returns JOB_NOT_FOUND for a job owned by a different customer", async () => {
    vi.mocked(authenticate).mockResolvedValue({
      ok: true,
      context: {
        requestId: "req_1",
        apiKey: { id: "key_1" } as never,
        customer: { id: "cust_mine" } as never,
        plan: {} as never,
      },
      rateLimitHeaders: {},
    });
    vi.mocked(getJobById).mockResolvedValue({
      id: "job_1",
      customer_id: "cust_someone_else",
      status: "succeeded",
    } as never);

    const res = await getJob(new Request("http://localhost/api/v1/jobs/job_1"), {
      params: Promise.resolve({ jobId: "job_1" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("JOB_NOT_FOUND");
  });

  it("GET /v1/jobs/:jobId returns the job when it belongs to the authenticated customer", async () => {
    vi.mocked(authenticate).mockResolvedValue({
      ok: true,
      context: {
        requestId: "req_1",
        apiKey: { id: "key_1" } as never,
        customer: { id: "cust_mine" } as never,
        plan: {} as never,
      },
      rateLimitHeaders: {},
    });
    vi.mocked(getJobById).mockResolvedValue({
      id: "job_1",
      customer_id: "cust_mine",
      status: "succeeded",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      request_id: "req_1",
      input: { keywords: ["a"], language: "en", constraints: { maxWords: 100 } },
      result: null,
      rendered: null,
      error_code: null,
      error_message: null,
    } as never);

    const res = await getJob(new Request("http://localhost/api/v1/jobs/job_1"), {
      params: Promise.resolve({ jobId: "job_1" }),
    });

    expect(res.status).toBe(200);
  });

  it("revoking an API key that belongs to a different customer returns 404, not a success", async () => {
    vi.mocked(requireSession).mockResolvedValue({
      user: { id: "user_1" } as never,
      customer: { id: "cust_mine" } as never,
    });
    // revokeApiKey filters by customer_id in SQL — simulate the "no matching row" result
    // an attacker gets when they pass someone else's key id.
    vi.mocked(revokeApiKey).mockResolvedValue(false);

    const res = await revokeKey(new Request("http://localhost/api/dashboard/api-keys/key_other/revoke", { method: "POST" }), {
      params: Promise.resolve({ id: "key_other" }),
    });

    expect(res.status).toBe(404);
    expect(revokeApiKey).toHaveBeenCalledWith("key_other", "cust_mine");
  });
});
