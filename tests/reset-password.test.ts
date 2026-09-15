import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-otp-hmac" },
}));

vi.mock("@/lib/server/password", () => ({
  hashPassword: vi.fn(async (pw: string) => `hashed:${pw}`),
}));

vi.mock("@/lib/server/repository", () => ({
  findOtpById: vi.fn(),
  deleteOtp: vi.fn(async () => undefined),
  updateUserPassword: vi.fn(async () => undefined),
  revokeAllSessionsForUser: vi.fn(async () => undefined),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
}));

const { POST } = await import("@/app/api/auth/reset-password/route");
const { signResetTicket } = await import("@/lib/server/otp");
const { findOtpById, deleteOtp, updateUserPassword, revokeAllSessionsForUser } =
  await import("@/lib/server/repository");
const { hashPassword } = await import("@/lib/server/password");

function resetRequest(body: unknown) {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function verifiedOtpRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "otp_1",
    user_id: "user_1",
    purpose: "password_reset" as const,
    otp_hash: "irrelevant-here",
    expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    attempts: 1,
    verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets the new password, consumes the OTP once, and revokes every existing session", async () => {
    const resetToken = await signResetTicket({ otpId: "otp_1", userId: "user_1" });
    vi.mocked(findOtpById).mockResolvedValue(verifiedOtpRow());

    const res = await POST(
      resetRequest({ resetToken, newPassword: "brandnewpassword123", confirmPassword: "brandnewpassword123" })
    );

    expect(res.status).toBe(200);
    expect(hashPassword).toHaveBeenCalledWith("brandnewpassword123");
    expect(updateUserPassword).toHaveBeenCalledWith("user_1", "hashed:brandnewpassword123");
    expect(deleteOtp).toHaveBeenCalledWith("otp_1");
    expect(revokeAllSessionsForUser).toHaveBeenCalledWith("user_1");
  });

  it("rejects mismatched password confirmation before touching the database", async () => {
    const resetToken = await signResetTicket({ otpId: "otp_1", userId: "user_1" });
    const res = await POST(
      resetRequest({ resetToken, newPassword: "brandnewpassword123", confirmPassword: "somethingelse123" })
    );
    expect(res.status).toBe(400);
    expect(updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects a tampered/garbage reset token", async () => {
    const res = await POST(
      resetRequest({ resetToken: "not-a-real-token", newPassword: "brandnewpassword123", confirmPassword: "brandnewpassword123" })
    );
    expect(res.status).toBe(400);
    expect(updateUserPassword).not.toHaveBeenCalled();
  });

  it("rejects reusing the same reset token a second time (OTP already consumed)", async () => {
    const resetToken = await signResetTicket({ otpId: "otp_1", userId: "user_1" });
    vi.mocked(findOtpById).mockResolvedValueOnce(verifiedOtpRow()).mockResolvedValueOnce(null);

    const first = await POST(
      resetRequest({ resetToken, newPassword: "brandnewpassword123", confirmPassword: "brandnewpassword123" })
    );
    expect(first.status).toBe(200);

    const second = await POST(
      resetRequest({ resetToken, newPassword: "anotherpassword456", confirmPassword: "anotherpassword456" })
    );
    expect(second.status).toBe(400);
    expect(updateUserPassword).toHaveBeenCalledTimes(1);
  });

  it("rejects a ticket whose OTP was never actually verified (verified_at null)", async () => {
    const resetToken = await signResetTicket({ otpId: "otp_1", userId: "user_1" });
    vi.mocked(findOtpById).mockResolvedValue(verifiedOtpRow({ verified_at: null }));

    const res = await POST(
      resetRequest({ resetToken, newPassword: "brandnewpassword123", confirmPassword: "brandnewpassword123" })
    );
    expect(res.status).toBe(400);
    expect(updateUserPassword).not.toHaveBeenCalled();
  });
});
