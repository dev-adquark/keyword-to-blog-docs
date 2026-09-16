import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-otp-hmac" },
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  findLatestPendingOtp: vi.fn(),
  incrementOtpAttempts: vi.fn(async () => 1),
  markOtpVerified: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
}));

const { POST } = await import("@/app/api/auth/verify-reset-otp/route");
const { hashOtp, verifyResetTicket } = await import("@/lib/server/otp");
const { findUserByEmail, findLatestPendingOtp, incrementOtpAttempts, markOtpVerified } =
  await import("@/lib/server/repository");

function verifyRequest(body: unknown) {
  return new Request("http://localhost/api/auth/verify-reset-otp", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function existingUser() {
  return {
    id: "user_1",
    email: "ada@example.com",
    password_hash: "x",
    name: "Ada",
    status: "active",
    role: "DEVELOPER" as const,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function pendingOtp(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "otp_1",
    user_id: "user_1",
    purpose: "password_reset" as const,
    otp_hash: hashOtp("654321"),
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    attempts: 0,
    verified_at: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("POST /api/auth/verify-reset-otp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("issues a scoped reset ticket on a correct code", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(existingUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp());

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "654321" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(markOtpVerified).toHaveBeenCalledWith("otp_1");

    const ticket = await verifyResetTicket(body.resetToken);
    expect(ticket).toEqual({ otpId: "otp_1", userId: "user_1" });
  });

  it("rejects an incorrect code and increments attempts, issuing no ticket", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(existingUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp());

    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "111111" }));
    expect(res.status).toBe(400);
    expect(incrementOtpAttempts).toHaveBeenCalledWith("otp_1");
    const body = await res.json();
    expect(body.resetToken).toBeUndefined();
  });

  it("rejects an expired code", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(existingUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(
      pendingOtp({ expires_at: new Date(Date.now() - 1000).toISOString() })
    );
    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "654321" }));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.message).toMatch(/expired/i);
  });

  it("rejects after 5 attempts", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(existingUser());
    vi.mocked(findLatestPendingOtp).mockResolvedValue(pendingOtp({ attempts: 5 }));
    const res = await POST(verifyRequest({ email: "ada@example.com", otp: "654321" }));
    expect(res.status).toBe(429);
  });

  it("does not reveal whether the email exists", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const res = await POST(verifyRequest({ email: "nobody@example.com", otp: "654321" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/invalid or expired/i);
  });
});
