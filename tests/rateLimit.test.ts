import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory fake that mirrors the subset of Redis commands rateLimit.ts uses,
// including a JS re-implementation of the Lua check-and-increment script so
// we can test the calling logic without a live Redis instance.
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

const { checkAndConsumeRateLimit } = await import("@/lib/server/rateLimit");
const { getPlan } = await import("@/lib/plans");

describe("checkAndConsumeRateLimit", () => {
  beforeEach(() => {
    fakeRedis.store.clear();
  });

  it("allows requests up to the plan's daily limit, then blocks", async () => {
    const plan = { ...getPlan("starter"), requestsPerMinute: 100 }; // isolate the daily window for this test
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
    // Day quota should still show only 1 consumed (from the first, allowed request).
    expect(second.day.remaining).toBe(plan.requestsPerDay - 1);
  });
});
