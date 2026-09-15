import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/redis", () => ({
  getRedis: () => ({
    eval: vi.fn(async () => {
      throw new Error("connection refused");
    }),
    set: vi.fn(async () => {
      throw new Error("connection refused");
    }),
  }),
}));

const { consumeFixedWindowLimit, consumeCooldown } = await import("@/lib/server/rateLimit");

describe("auth rate-limit helpers fail open when Redis is unreachable", () => {
  it("consumeFixedWindowLimit allows the request instead of throwing (signup/login must not 500)", async () => {
    await expect(consumeFixedWindowLimit("rl:test:key", 5, 60)).resolves.toEqual({
      allowed: true,
      remaining: 5,
    });
  });

  it("consumeCooldown allows the request instead of throwing", async () => {
    await expect(consumeCooldown("otp:cooldown:test", 60)).resolves.toBe(true);
  });
});
