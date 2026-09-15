import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-otp-hmac" },
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  createOtp: vi.fn(async () => ({ id: "otp_1" })),
}));

vi.mock("@/lib/server/authEmail", () => ({
  sendPasswordResetEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
  consumeCooldown: vi.fn(async () => true),
}));

const { POST } = await import("@/app/api/auth/forgot-password/route");
const { findUserByEmail, createOtp } = await import("@/lib/server/repository");
const { sendPasswordResetEmail } = await import("@/lib/server/authEmail");
const { consumeCooldown, consumeFixedWindowLimit } = await import("@/lib/server/rateLimit");

function forgotRequest(body: unknown) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const GENERIC_MESSAGE = "If an account exists for this email, a verification code has been sent.";

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consumeFixedWindowLimit).mockResolvedValue({ allowed: true, remaining: 9 });
    vi.mocked(consumeCooldown).mockResolvedValue(true);
  });

  it("returns the exact same generic response for an existing email", async () => {
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

    const res = await POST(forgotRequest({ email: "ada@example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(createOtp).toHaveBeenCalled();
    expect(sendPasswordResetEmail).toHaveBeenCalled();
  });

  it("returns the identical generic response for a nonexistent email, without sending anything", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const res = await POST(forgotRequest({ email: "nobody@example.com" }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("returns the generic response even for a malformed email — no field-level enumeration hint", async () => {
    const res = await POST(forgotRequest({ email: "not-an-email" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toBe(GENERIC_MESSAGE);
  });

  it("is rate limited per email via the 60s cooldown, but still returns the generic response", async () => {
    vi.mocked(consumeCooldown).mockResolvedValue(false);
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

    const res = await POST(forgotRequest({ email: "ada@example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toBe(GENERIC_MESSAGE);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it("is rate limited per IP against email-bombing across many addresses", async () => {
    vi.mocked(consumeFixedWindowLimit).mockResolvedValue({ allowed: false, remaining: 0 });
    const res = await POST(forgotRequest({ email: "ada@example.com" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.message).toBe(GENERIC_MESSAGE); // still generic, just silently a no-op
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
