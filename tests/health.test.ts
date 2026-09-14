import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/db", () => ({
  query: vi.fn(),
}));

const redisClient = { ping: vi.fn() };

vi.mock("@/lib/server/redis", () => ({
  getRedis: () => redisClient,
}));

const { query } = await import("@/lib/server/db");
const { GET } = await import("@/app/api/health/route");

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("reports ok (200) when both db and redis are reachable", async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(redisClient.ping).mockResolvedValue("PONG");

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual({ db: true, redis: true });
  });

  it("reports degraded (503) when redis is unreachable, without throwing", async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(redisClient.ping).mockRejectedValue(new Error("connection refused"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks).toEqual({ db: true, redis: false });
  });

  it("reports config presence booleans without ever including secret values", async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(redisClient.ping).mockResolvedValue("PONG");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-real-secret-value");
    vi.stubEnv("RESEND_API_KEY", "re_real_secret_value");
    vi.stubEnv("OWNER_NOTIFICATION_EMAIL", "owner@example.com");
    vi.stubEnv("QSTASH_TOKEN", "qstash-secret");
    vi.stubEnv("QSTASH_CURRENT_SIGNING_KEY", "sig-1");
    vi.stubEnv("QSTASH_NEXT_SIGNING_KEY", "sig-2");

    const res = await GET();
    const body = await res.json();
    const rawText = JSON.stringify(body);

    expect(body.config).toEqual({ anthropic: true, resend: true, qstash: true });
    expect(rawText).not.toMatch(/sk-real-secret-value|re_real_secret_value|qstash-secret|sig-1|sig-2/);
  });

  it("reports config as false when unset, without throwing", async () => {
    vi.mocked(query).mockResolvedValue([]);
    vi.mocked(redisClient.ping).mockResolvedValue("PONG");

    const res = await GET();
    const body = await res.json();

    expect(body.config).toEqual({ anthropic: false, resend: false, qstash: false });
  });
});
