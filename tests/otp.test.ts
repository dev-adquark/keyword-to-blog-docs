import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret-for-otp-hmac" },
}));

const { generateOtp, hashOtp, verifyOtpHash, otpExpiryDate, signResetTicket, verifyResetTicket, OTP_TTL_MINUTES, OTP_MAX_ATTEMPTS } =
  await import("@/lib/server/otp");

describe("generateOtp", () => {
  it("always produces a zero-padded 6-digit numeric string", () => {
    for (let i = 0; i < 200; i++) {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{6}$/);
    }
  });

  it("is not trivially predictable across repeated calls", () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateOtp()));
    expect(codes.size).toBeGreaterThan(50); // extremely unlikely to collide this much by chance
  });
});

describe("hashOtp / verifyOtpHash", () => {
  it("verifies a matching code and rejects a non-matching one", () => {
    const otp = "123456";
    const hash = hashOtp(otp);
    expect(verifyOtpHash(otp, hash)).toBe(true);
    expect(verifyOtpHash("654321", hash)).toBe(false);
  });

  it("never stores or compares the plaintext code directly", () => {
    const otp = "000111";
    const hash = hashOtp(otp);
    expect(hash).not.toContain(otp);
    expect(hash).toMatch(/^[0-9a-f]{64}$/); // hex-encoded HMAC-SHA256
  });

  it("rejects a malformed stored hash instead of throwing", () => {
    expect(verifyOtpHash("123456", "not-hex-at-all")).toBe(false);
  });
});

describe("otpExpiryDate", () => {
  it("expires OTP_TTL_MINUTES (10) minutes from now", () => {
    const now = Date.now();
    const expiry = otpExpiryDate().getTime();
    expect(OTP_TTL_MINUTES).toBe(10);
    expect(expiry - now).toBeGreaterThan(9 * 60_000);
    expect(expiry - now).toBeLessThanOrEqual(10 * 60_000 + 1000);
  });
});

describe("OTP_MAX_ATTEMPTS", () => {
  it("caps verification attempts at 5", () => {
    expect(OTP_MAX_ATTEMPTS).toBe(5);
  });
});

describe("password-reset ticket", () => {
  it("round-trips otpId/userId through a signed ticket", async () => {
    const token = await signResetTicket({ otpId: "otp_1", userId: "user_1" });
    const payload = await verifyResetTicket(token);
    expect(payload).toEqual({ otpId: "otp_1", userId: "user_1" });
  });

  it("rejects a tampered or garbage ticket", async () => {
    await expect(verifyResetTicket("not-a-real-jwt")).resolves.toBeNull();
  });

  it("rejects a ticket signed with a different secret", async () => {
    vi.doMock("@/lib/server/env", () => ({ env: { AUTH_SECRET: "a-different-secret" } }));
    vi.resetModules();
    const { signResetTicket: signWithOtherSecret } = await import("@/lib/server/otp");
    const forged = await signWithOtherSecret({ otpId: "otp_1", userId: "user_1" });

    vi.doMock("@/lib/server/env", () => ({ env: { AUTH_SECRET: "test-secret-for-otp-hmac" } }));
    vi.resetModules();
    const { verifyResetTicket: verifyWithRealSecret } = await import("@/lib/server/otp");
    await expect(verifyWithRealSecret(forged)).resolves.toBeNull();
  });
});
