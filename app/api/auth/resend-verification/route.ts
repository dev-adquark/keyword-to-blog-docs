import { NextResponse } from "next/server";
import { resendVerificationSchema } from "@/lib/server/validation";
import { findUserByEmail, createOtp } from "@/lib/server/repository";
import { generateOtp, hashOtp, otpExpiryDate } from "@/lib/server/otp";
import { sendVerificationEmail } from "@/lib/server/authEmail";
import { consumeCooldown, consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account is pending verification for this email, a new code has been sent.",
};
const COOLDOWN_SECONDS = 60;

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:resend-verification:ip:${ip}`, 10, 60 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", message: "Too many requests. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = body ? resendVerificationSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Please provide a valid email address." },
      { status: 400 }
    );
  }
  const { email } = parsed.data;

  const allowed = await consumeCooldown(`otp:cooldown:email_verification:${email.toLowerCase()}`, COOLDOWN_SECONDS);
  if (!allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", message: "Please wait before requesting another code." },
      { status: 429 }
    );
  }

  const user = await findUserByEmail(email);
  if (user && !user.email_verified_at) {
    const otp = generateOtp();
    await createOtp({
      userId: user.id,
      purpose: "email_verification",
      otpHash: hashOtp(otp),
      expiresAt: otpExpiryDate(),
    });
    await sendVerificationEmail({ to: user.email, otp });
  }

  // Same response whether the account exists, is already verified, or never
  // existed at all — no enumeration signal either way.
  return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
}
