import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/password", () => ({
  hashPassword: vi.fn(async () => "hashed"),
  passwordMeetsPolicy: vi.fn(() => true),
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  createUserAndCustomer: vi.fn(),
  createOtp: vi.fn(async () => ({ id: "otp_1" })),
}));

vi.mock("@/lib/server/authEmail", () => ({
  sendVerificationEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret" },
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
}));

vi.mock("@/lib/server/notifications", () => ({
  notifyOwner: vi.fn(async () => undefined),
  safeAfter: vi.fn((fn: () => Promise<void>) => fn()),
}));

const { POST } = await import("@/app/api/auth/signup/route");
const { findUserByEmail, createUserAndCustomer, createOtp } = await import("@/lib/server/repository");
const { sendVerificationEmail } = await import("@/lib/server/authEmail");

function signupRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "longenoughpassword",
};

describe("signup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates an unverified account, issues an OTP, and sends the verification email — no session cookie", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createUserAndCustomer).mockResolvedValue({
      user: {
        id: "user_1",
        email: "ada@example.com",
        password_hash: "hashed",
        name: "Ada Lovelace",
        status: "active",
        email_verified_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      customer: {
        id: "cus_1",
        user_id: "user_1",
        plan: "starter",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const res = await POST(signupRequest(validBody));

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.email).toBe("ada@example.com");
    expect(res.headers.get("set-cookie")).toBeNull();

    expect(createOtp).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", purpose: "email_verification" })
    );
    expect(sendVerificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "ada@example.com" })
    );
  });

  it("never includes the raw OTP anywhere in the response body", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createUserAndCustomer).mockResolvedValue({
      user: {
        id: "user_1",
        email: "ada@example.com",
        password_hash: "hashed",
        name: "Ada Lovelace",
        status: "active",
        email_verified_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      customer: {
        id: "cus_1",
        user_id: "user_1",
        plan: "starter",
        status: "active",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    const res = await POST(signupRequest(validBody));
    const rawText = JSON.stringify(await res.json());
    // The OTP passed to sendVerificationEmail is the only place it exists —
    // confirm the actual sent OTP never leaks into the HTTP response.
    const sentOtp = vi.mocked(sendVerificationEmail).mock.calls[0]?.[0]?.otp;
    expect(sentOtp).toMatch(/^\d{6}$/);
    expect(rawText).not.toContain(sentOtp!);
  });

  it("does not create an account or send an OTP when signup fails, and returns a safe error", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createUserAndCustomer).mockRejectedValue(new Error("db down"));

    const res = await POST(signupRequest(validBody));

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("We couldn't create your account. Please try again.");
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("returns the duplicate-email validation message without crashing", async () => {
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

    const res = await POST(signupRequest(validBody));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("An account with this email already exists.");
  });
});
