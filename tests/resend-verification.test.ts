import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-otp-hmac" },
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  createOtp: vi.fn(async () => ({ id: "otp_1" })),
}));

vi.mock("@/lib/server/authEmail", () => ({
  sendVerificationEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
  consumeCooldown: vi.fn(async () => true),
}));

const { POST } = await import("@/app/api/auth/resend-verification/route");
const { findUserByEmail, createOtp } = await import("@/lib/server/repository");
const { sendVerificationEmail } = await import("@/lib/server/authEmail");
const { consumeCooldown, consumeFixedWindowLimit } = await import("@/lib/server/rateLimit");

function resendRequest(body: unknown) {
  return new Request("http://localhost/api/auth/resend-verification", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/resend-verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consumeFixedWindowLimit).mockResolvedValue({ allowed: true, remaining: 9 });
    vi.mocked(consumeCooldown).mockResolvedValue(true);
  });

  it("sends a new code for an unverified account and returns the generic response", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      password_hash: "x",
      name: "Ada",
      status: "active",
      email_verified_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await POST(resendRequest({ email: "ada@example.com" }));
    expect(res.status).toBe(200);
    expect(createOtp).toHaveBeenCalled();
    expect(sendVerificationEmail).toHaveBeenCalled();
  });

  it("returns the identical generic response for a nonexistent email — no enumeration, no email sent", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const res = await POST(resendRequest({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toMatch(/if an account is pending verification/i);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("does not resend for an already-verified account, but still returns the generic response", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      password_hash: "x",
      name: "Ada",
      status: "active",
      email_verified_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await POST(resendRequest({ email: "ada@example.com" }));
    expect(res.status).toBe(200);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("enforces the 60-second resend cooldown", async () => {
    vi.mocked(consumeCooldown).mockResolvedValue(false);
    const res = await POST(resendRequest({ email: "ada@example.com" }));
    expect(res.status).toBe(429);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });
});
