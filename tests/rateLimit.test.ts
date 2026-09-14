import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeRedis {
  store = new Map<string, number>();

  async get<T>(key: string): Promise<T | null> {
    return (this.store.has(key) ? (this.store.get(key) as unknown as T) : null);
  }

  async decr(key: string): Promise<number> {
    const next = (this.store.get(key) ?? 0) - 1;
    this.store.set(key, next);
    return next;
  }

  async eval(_script: string, keys: string[], args: string[]): Promise<[number, number, number]> {
    const key = keys[0];
    const limit = Number(args[0]);
    const current = (this.store.get(key) ?? 0) + 1;
    this.store.set(key, current);
    if (current > limit) {
      this.store.set(key, current - 1);
      return [0, limit, 0];
    }
    return [1, limit, limit - current];
  }
}

const fakeRedis = new FakeRedis();

vi.mock("@/lib/server/redis", () => ({
  getRedis: () => fakeRedis,
}));

vi.mock("@/lib/server/repository", () => ({
  findApiKeyByHash: vi.fn(),
  findCustomerById: vi.fn(),
  touchApiKeyLastUsed: vi.fn(async () => undefined),
  getUsageSince: vi.fn(async () => ({ requests: 0, words: 0 })),
}));

const { checkAndConsumeRateLimit } = await import("@/lib/server/rateLimit");
const { getPlan } = await import("@/lib/plans");
const { authenticate } = await import("@/lib/server/withApiAuth");
const { findApiKeyByHash, findCustomerById } = await import("@/lib/server/repository");

describe("checkAndConsumeRateLimit", () => {
  beforeEach(() => {
    fakeRedis.store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the plan's daily limit, then blocks", async () => {
    const plan = { ...getPlan("starter"), requestsPerMinute: 100 };
    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await checkAndConsumeRateLimit("key_test_1", plan));
    }
    expect(results[0].allowed).toBe(true);
    expect(results[1].allowed).toBe(true);
    expect(results[2].allowed).toBe(true);
    expect(results[3].allowed).toBe(false);
    expect(results[3].blockedBy).toBe("day");
  });

  it("tracks separate quotas per API key", async () => {
    const plan = { ...getPlan("starter"), requestsPerMinute: 100 };
    for (let i = 0; i < 3; i++) {
      await checkAndConsumeRateLimit("key_A", plan);
    }
    const blockedA = await checkAndConsumeRateLimit("key_A", plan);
    const allowedB = await checkAndConsumeRateLimit("key_B", plan);
    expect(blockedA.allowed).toBe(false);
    expect(allowedB.allowed).toBe(true);
  });

  it("does not consume the daily quota for a request blocked by the per-minute limit", async () => {
    const plan = { ...getPlan("starter"), requestsPerMinute: 1, requestsPerDay: 10 };
    const first = await checkAndConsumeRateLimit("key_minute", plan);
    const second = await checkAndConsumeRateLimit("key_minute", plan);
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    expect(second.blockedBy).toBe("minute");
    expect(second.day.remaining).toBe(plan.requestsPerDay - 1);
  });

  it("keeps concurrent requests atomic for the same API key", async () => {
    const plan = { ...getPlan("starter"), requestsPerMinute: 100, requestsPerDay: 3 };
    const results = await Promise.all(
      Array.from({ length: 10 }, () => checkAndConsumeRateLimit("key_concurrent_same", plan))
    );
    const allowed = results.filter((r) => r.allowed).length;
    const blocked = results.filter((r) => !r.allowed).length;
    expect(allowed).toBe(3);
    expect(blocked).toBe(7);
    expect(results.every((r) => r.day.remaining >= 0)).toBe(true);
  });
});

describe("authenticate rate-limit HTTP contract", () => {
  beforeEach(() => {
    fakeRedis.store.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns success headers for an allowed request", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(findApiKeyByHash).mockResolvedValue({
      id: "api_1",
      customer_id: "cust_1",
      key_prefix: "ktb_live_abcd",
      key_hash: "hash",
      name: "Test Key",
      environment: "live",
      scopes: ["generate"],
      status: "active",
      created_at: now.toISOString(),
      last_used_at: null,
      revoked_at: null,
    });
    vi.mocked(findCustomerById).mockResolvedValue({
      id: "cust_1",
      user_id: "user_1",
      plan: "starter",
      status: "active",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    const result = await authenticate(
      new Request("https://example.com/api/v1/generate", {
        headers: { "x-api-key": "ktb_live_abc" },
      }),
      { requiredScope: "generate", consumeRateLimit: true }
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected auth to succeed");
    const expectedReset = Math.floor(
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)).getTime() / 1000
    );
    expect(result.rateLimitHeaders["X-RateLimit-Limit"]).toBe("3");
    expect(result.rateLimitHeaders["X-RateLimit-Remaining"]).toBe("2");
    expect(result.rateLimitHeaders["X-RateLimit-Reset"]).toBe(String(expectedReset));
  });

  it("returns 429 with all required headers when a request exceeds the limit", async () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    vi.mocked(findApiKeyByHash).mockResolvedValue({
      id: "api_1",
      customer_id: "cust_1",
      key_prefix: "ktb_live_abcd",
      key_hash: "hash",
      name: "Test Key",
      environment: "live",
      scopes: ["generate"],
      status: "active",
      created_at: now.toISOString(),
      last_used_at: null,
      revoked_at: null,
    });
    vi.mocked(findCustomerById).mockResolvedValue({
      id: "cust_1",
      user_id: "user_1",
      plan: "starter",
      status: "active",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    const plan = getPlan("starter");
    const startKey = `rl:day:api_1:${new Date().toISOString().slice(0, 10)}`;
    fakeRedis.store.set(startKey, plan.requestsPerDay);
    const minuteKey = `rl:min:api_1:${Math.floor(now.getTime() / 60_000)}`;
    fakeRedis.store.set(minuteKey, plan.requestsPerMinute);

    const result = await authenticate(
      new Request("https://example.com/api/v1/generate", {
        headers: { "x-api-key": "ktb_live_abc" },
      }),
      { requiredScope: "generate", consumeRateLimit: true }
    );

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected auth to fail");

    const res = result.response;
    const expectedMinuteReset = (Math.floor(now.getTime() / 60_000) + 1) * 60;
    expect(res.status).toBe(429);
    expect(res.headers.get("X-RateLimit-Limit")).toBe("1");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe(String(expectedMinuteReset));
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});
