import { NextResponse } from "next/server";
import { verifyEmailSchema } from "@/lib/server/validation";
import {
  findUserByEmail,
  findLatestPendingOtp,
  incrementOtpAttempts,
  markOtpVerified,
  markUserEmailVerified,
} from "@/lib/server/repository";
import { verifyOtpHash, OTP_MAX_ATTEMPTS } from "@/lib/server/otp";
import { consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

const GENERIC_INVALID = { code: "VALIDATION_ERROR", message: "Invalid or expired code." };
const EXPIRED = { code: "VALIDATION_ERROR", message: "Verification code has expired. Please request a new code." };
const TOO_MANY = { code: "RATE_LIMITED", message: "Too many attempts. Please request a new code." };

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:verify-email:ip:${ip}`, 30, 60 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = body ? verifyEmailSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    return NextResponse.json(GENERIC_INVALID, { status: 400 });
  }
  const { email, otp } = parsed.data;

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json(GENERIC_INVALID, { status: 400 });
  }

  if (user.email_verified_at) {
    return NextResponse.json({ ok: true, alreadyVerified: true }, { status: 200 });
  }

  const pending = await findLatestPendingOtp(user.id, "email_verification");
  if (!pending) {
    return NextResponse.json(EXPIRED, { status: 400 });
  }
  if (new Date(pending.expires_at).getTime() < Date.now()) {
    return NextResponse.json(EXPIRED, { status: 400 });
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  if (!verifyOtpHash(otp, pending.otp_hash)) {
    await incrementOtpAttempts(pending.id);
    return NextResponse.json(GENERIC_INVALID, { status: 400 });
  }

  await markOtpVerified(pending.id);
  await markUserEmailVerified(user.id);

  return NextResponse.json({ ok: true }, { status: 200 });
}
