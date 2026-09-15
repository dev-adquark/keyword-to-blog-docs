import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/server/redis", () => ({
  getRedis: () => ({
    eval: vi.fn(async () => [1, 100, 99]),
    get: vi.fn(async () => 0),
    decr: vi.fn(async () => 0),
  }),
}));

vi.mock("@/lib/server/repository", () => ({
  findApiKeyByHash: vi.fn(),
  findCustomerById: vi.fn(),
  touchApiKeyLastUsed: vi.fn(async () => undefined),
  getUsageSince: vi.fn(),
}));

const { getPlan } = await import("@/lib/plans");
const { authenticate } = await import("@/lib/server/withApiAuth");
const { findApiKeyByHash, findCustomerById, getUsageSince } = await import(
  "@/lib/server/repository"
);

function mockActiveKeyAndCustomer(plan: string) {
  vi.mocked(findApiKeyByHash).mockResolvedValue({
    id: "api_1",
    customer_id: "cust_1",
    key_prefix: "ktb_live_abcd",
    key_hash: "hash",
    name: "Test Key",
    environment: "live",
    scopes: ["generate", "usage:read"],
    status: "active",
    created_at: new Date().toISOString(),
    last_used_at: null,
    revoked_at: null,
  });
  vi.mocked(findCustomerById).mockResolvedValue({
    id: "cust_1",
    user_id: "user_1",
    plan,
    status: "active",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

describe("monthly quota enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks a request with QUOTA_EXCEEDED once the plan's monthly word cap is reached", async () => {
    const plan = getPlan("starter");
    mockActiveKeyAndCustomer("starter");
    vi.mocked(getUsageSince).mockResolvedValue({ requests: 5, words: plan.monthlyWords, posts: 5 });

    const result = await authenticate(
      new Request("https://example.com/api/v1/generate", {
        headers: { "x-api-key": "ktb_live_abc" },
      }),
      { requiredScope: "generate", consumeRateLimit: true }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected auth to fail");
    expect(result.response.status).toBe(429);
    const body = await result.response.json();
    expect(body.error.code).toBe("QUOTA_EXCEEDED");
  });

  it("blocks a request with QUOTA_EXCEEDED once the plan's monthly request cap is reached", async () => {
    const plan = getPlan("starter");
    mockActiveKeyAndCustomer("starter");
    vi.mocked(getUsageSince).mockResolvedValue({ requests: plan.monthlyRequests, words: 100, posts: plan.monthlyRequests });

    const result = await authenticate(
      new Request("https://example.com/api/v1/generate", {
        headers: { "x-api-key": "ktb_live_abc" },
      }),
      { requiredScope: "generate", consumeRateLimit: true }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected auth to fail");
    expect(result.response.status).toBe(429);
  });

  it("allows the request through when usage is well under the monthly cap", async () => {
    mockActiveKeyAndCustomer("starter");
    vi.mocked(getUsageSince).mockResolvedValue({ requests: 1, words: 10, posts: 1 });

    const result = await authenticate(
      new Request("https://example.com/api/v1/generate", {
        headers: { "x-api-key": "ktb_live_abc" },
      }),
      { requiredScope: "generate", consumeRateLimit: true }
    );

    expect(result.ok).toBe(true);
  });

  it("does not check monthly quota for endpoints that don't consume rate limit (e.g. GET /v1/usage)", async () => {
    mockActiveKeyAndCustomer("starter");

    const result = await authenticate(
      new Request("https://example.com/api/v1/usage", {
        headers: { "x-api-key": "ktb_live_abc" },
      }),
      { requiredScope: "usage:read", consumeRateLimit: false }
    );

    expect(result.ok).toBe(true);
    expect(getUsageSince).not.toHaveBeenCalled();
  });
});
