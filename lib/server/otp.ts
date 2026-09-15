import "server-only";
import { randomInt, createHmac, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "./env";

export type OtpPurpose = "email_verification" | "password_reset";

export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;

/** Cryptographically secure 6-digit code, zero-padded (never predictable, never Math.random()). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Keyed with AUTH_SECRET (HMAC, not a plain hash) so a database-only leak
 * can't be brute-forced offline against the 6-digit (1e6) space — an
 * attacker would also need AUTH_SECRET, which never leaves the server.
 */
export function hashOtp(otp: string): string {
  return createHmac("sha256", env.AUTH_SECRET).update(otp).digest("hex");
}

/** Constant-time comparison — never short-circuits on the first differing byte. */
export function verifyOtpHash(otp: string, hash: string): boolean {
  const expected = Buffer.from(hashOtp(otp), "hex");
  let provided: Buffer;
  try {
    provided = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}

export function otpExpiryDate(): Date {
  return new Date(Date.now() + OTP_TTL_MINUTES * 60_000);
}

// ---------- Password-reset ticket ----------
//
// Once an OTP is verified in POST /api/auth/verify-reset-otp, the client
// needs a way to prove that to POST /api/auth/reset-password without
// resubmitting (and re-risking replay of) the code itself. A short-lived
// signed ticket scoped to that specific OTP row does this — it can't be
// forged without AUTH_SECRET, and expires well before the OTP itself would.

const RESET_TICKET_TTL = "10m";

export async function signResetTicket(params: {
  otpId: string;
  userId: string;
}): Promise<string> {
  return new SignJWT({ otpId: params.otpId, userId: params.userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(RESET_TICKET_TTL)
    .sign(new TextEncoder().encode(env.AUTH_SECRET));
}

export async function verifyResetTicket(
  token: string
): Promise<{ otpId: string; userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(env.AUTH_SECRET));
    if (typeof payload.otpId !== "string" || typeof payload.userId !== "string") return null;
    return { otpId: payload.otpId, userId: payload.userId };
  } catch {
    return null;
  }
}
