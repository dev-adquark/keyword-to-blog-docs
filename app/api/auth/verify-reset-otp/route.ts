import { NextResponse } from "next/server";
import { verifyResetOtpSchema } from "@/lib/server/validation";
import {
  findUserByEmail,
  findLatestPendingOtp,
  incrementOtpAttempts,
  markOtpVerified,
} from "@/lib/server/repository";
import { verifyOtpHash, OTP_MAX_ATTEMPTS, signResetTicket } from "@/lib/server/otp";
import { consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

const GENERIC_INVALID = { code: "VALIDATION_ERROR", message: "Invalid or expired code." };
const EXPIRED = { code: "VALIDATION_ERROR", message: "Verification code has expired. Please request a new code." };
const TOO_MANY = { code: "RATE_LIMITED", message: "Too many attempts. Please request a new code." };

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:verify-reset-otp:ip:${ip}`, 30, 60 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(TOO_MANY, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = body ? verifyResetOtpSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    return NextResponse.json(GENERIC_INVALID, { status: 400 });
  }
  const { email, otp } = parsed.data;

  const user = await findUserByEmail(email);
  if (!user) {
    return NextResponse.json(GENERIC_INVALID, { status: 400 });
  }

  const pending = await findLatestPendingOtp(user.id, "password_reset");
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
  const resetToken = await signResetTicket({ otpId: pending.id, userId: user.id });

  return NextResponse.json({ ok: true, resetToken }, { status: 200 });
}
