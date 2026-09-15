import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-otp-hmac" },
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  findLatestPendingOtp: vi.fn(),
  incrementOtpAttempts: vi.fn(async () => 1),
  markOtpVerified: vi.fn(async () => undefined),
  markUserEmailVerified: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
}));

const { POST } = await import("@/app/api/auth/verify-email/route");
const { hashOtp } = await import("@/lib/server/otp");
const {
  findUserByEmail,
  findLatestPendingOtp,
  incrementOtpAttempts,
  markOtpVerified,
  markUserEmailVerified,
} = await import("@/lib/server/repository");
const { consumeFixedWindowLimit } = await import("@/lib/server/rateLimit");

function verifyRequest(body: unknown) {
  return new Request("http://localhost/api/auth/verify-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function unverifiedUser() {
  return {
    id: "user_1",
    email: "ada@example.com",
    password_hash: "x",
    name: "Ada",
    status: "active",
    email_verified_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function pendingOtp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "otp_1",
    user_id: "user_1",
    purpose: "email_verification" as const,
    otp_hash: hashOtp("123456"),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    attempts: 0,
    verified_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("POST /api/auth/verify-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consumeFixedWindowLimit).mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it("verifies with the correct code", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(unverifiedUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp());

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "123456" }));
    expect(res.status).toBe(200);
    expect(markOtpVerified).toHaveBeenCalledWith("otp_1");
    expect(markUserEmailVerified).toHaveBeenCalledWith("user_1");
  });

  it("rejects an incorrect code and increments attempts", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(unverifiedUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp());

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "000000" }));
    expect(res.status).toBe(400);
    expect(incrementOtpAttempts).toHaveBeenCalledWith("otp_1");
    expect(markUserEmailVerified).not.toHaveBeenCalled();
  });

  it("rejects an expired code with a distinct message", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(unverifiedUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(
      pendingOtp({ expires_at: new Date(Date.now() - 1000).toISOString() })
    );

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "123456" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.message).toMatch(/expired/i);
  });

  it("rejects once the 5-attempt limit is reached, without checking the code", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(unverifiedUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp({ attempts: 5 }));

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "123456" }));
    expect(res.status).toBe(429);
    expect(markOtpVerified).not.toHaveBeenCalled();
  });

  it("cannot be reused after successful verification (no pending OTP left)", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({ ...unverifiedUser(), email_verified_at: new Date().toISOString() });

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "123456" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.alreadyVerified).toBe(true);
  });

  it("returns a generic error for a nonexistent email — no enumeration", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const res = await POST(verifyRequest({ email: "nobody@example.com", otp: "123456" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).not.toMatch(/no account|does not exist/i);
  });

  it("never echoes the OTP back in any response", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(unverifiedUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp());
    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "123456" }));
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toContain("123456");
  });
});
