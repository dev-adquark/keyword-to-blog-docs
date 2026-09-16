import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeRedis {
  store = new Map<string, { value: string; expiresAt: number | null }>();

  private read(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async incr(key: string): Promise<number> {
    const current = Number(this.read(key) ?? "0") + 1;
    const existing = this.store.get(key);
    this.store.set(key, { value: String(current), expiresAt: existing?.expiresAt ?? null });
    return current;
  }

  async expire(key: string, seconds: number): Promise<void> {
    const entry = this.store.get(key);
    if (entry) entry.expiresAt = Date.now() + seconds * 1000;
  }

  async set(
    key: string,
    value: string,
    opts?: { nx?: boolean; ex?: number }
  ): Promise<string | null> {
    if (opts?.nx && this.read(key) !== null) return null;
    this.store.set(key, {
      value,
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : null,
    });
    return "OK";
  }
}

const fakeRedis = new FakeRedis();

vi.mock("@/lib/server/redis", () => ({
  getRedis: () => fakeRedis,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn(() => {
      throw new Error("no request scope in this test");
    }),
  };
});

describe("notifications", () => {
  beforeEach(() => {
    fakeRedis.store.clear();
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("notifyOwner is a no-op when Resend isn't configured — never throws", async () => {
    vi.unstubAllEnvs();
    const { notifyOwner } = await import("@/lib/server/notifications");
    await expect(
      notifyOwner({
        type: "API_KEY_CREATED",
        userId: "usr_1",
        email: "a@example.com",
        name: "A",
        plan: "starter",
        apiKeyId: "key_1",
        keyPrefix: "ktb_live_abcd1234",
        environment: "live",
        createdAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it("notifyOwner never throws even when the Resend request fails", async () => {
    global.fetch = vi.fn(async () => new Response("error", { status: 500 })) as unknown as typeof fetch;
    const { notifyOwner } = await import("@/lib/server/notifications");
    await expect(
      notifyOwner({
        type: "API_KEY_CREATED",
        userId: "usr_1",
        email: "a@example.com",
        name: "A",
        plan: "starter",
        apiKeyId: "key_1",
        keyPrefix: "ktb_live_abcd1234",
        environment: "live",
        createdAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it("notifyOwner never throws even when fetch itself rejects (network failure)", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const { notifyOwner } = await import("@/lib/server/notifications");
    await expect(
      notifyOwner({
        type: "API_KEY_CREATED",
        userId: "usr_1",
        email: "a@example.com",
        name: "A",
        plan: "starter",
        apiKeyId: "key_1",
        keyPrefix: "ktb_live_abcd1234",
        environment: "live",
        createdAt: new Date().toISOString(),
      })
    ).resolves.toBeUndefined();
  });

  it("never sends the full API key — only the prefix — in the API_KEY_CREATED payload", async () => {
    let capturedBody: string | undefined;
    global.fetch = vi.fn(async (_url, init) => {
      capturedBody = init?.body as string;
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;

    const { notifyOwner } = await import("@/lib/server/notifications");
    await notifyOwner({
      type: "API_KEY_CREATED",
      userId: "usr_1",
      email: "a@example.com",
      name: "A",
      plan: "starter",
      apiKeyId: "key_1",
      keyPrefix: "ktb_live_abcd1234",
      environment: "live",
      createdAt: new Date().toISOString(),
    });

    expect(capturedBody).toBeDefined();
    expect(capturedBody).toContain("ktb_live_abcd1234");
    // The full raw secret is never available to this module in the first
    // place (callers only ever pass key_prefix) — assert the shape reflects that.
    expect(JSON.parse(capturedBody!).text).not.toMatch(/ktb_(live|test)_[A-Za-z0-9_-]{20,}/);
  });

  it("recordRepeatedViolation does not notify below the threshold", async () => {
    const { recordRepeatedViolation } = await import("@/lib/server/notifications");
    for (let i = 0; i < 3; i++) {
      const result = await recordRepeatedViolation({ kind: "rate_limit", key: "cust_1:/api/v1/generate" });
      expect(result.shouldNotify).toBe(false);
    }
  });

  it("recordRepeatedViolation notifies exactly once at the threshold, then cools down", async () => {
    const { recordRepeatedViolation } = await import("@/lib/server/notifications");
    const key = "cust_2:/api/v1/generate";
    let notifyCount = 0;
    for (let i = 0; i < 8; i++) {
      const result = await recordRepeatedViolation({ kind: "quota", key });
      if (result.shouldNotify) notifyCount++;
    }
    expect(notifyCount).toBe(1);
  });

  it("recordRepeatedViolation is a no-op (never notifies) when notifications aren't configured", async () => {
    vi.unstubAllEnvs();
    const { recordRepeatedViolation } = await import("@/lib/server/notifications");
    for (let i = 0; i < 10; i++) {
      const result = await recordRepeatedViolation({ kind: "login_failure", key: "a@example.com" });
      expect(result.shouldNotify).toBe(false);
    }
  });

  it("safeAfter swallows a synchronous throw from after() (e.g. no request scope) without propagating", async () => {
    const { safeAfter } = await import("@/lib/server/notifications");
    expect(() => safeAfter(async () => {})).not.toThrow();
  });
});
