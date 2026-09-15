import { NextResponse } from "next/server";
import { forgotPasswordSchema } from "@/lib/server/validation";
import { findUserByEmail, createOtp } from "@/lib/server/repository";
import { generateOtp, hashOtp, otpExpiryDate } from "@/lib/server/otp";
import { sendPasswordResetEmail } from "@/lib/server/authEmail";
import { consumeCooldown, consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

// Never reveals whether an account exists — identical response either way.
const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for this email, a verification code has been sent.",
};
const COOLDOWN_SECONDS = 60;

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:forgot-password:ip:${ip}`, 10, 60 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }

  const body = await req.json().catch(() => null);
  const parsed = body ? forgotPasswordSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    // Malformed input still gets the generic response — no field-level
    // feedback that could help enumerate valid-looking emails.
    return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
  }
  const { email } = parsed.data;

  const allowed = await consumeCooldown(`otp:cooldown:password_reset:${email.toLowerCase()}`, COOLDOWN_SECONDS);
  if (allowed) {
    const user = await findUserByEmail(email);
    if (user && user.status === "active") {
      const otp = generateOtp();
      await createOtp({
        userId: user.id,
        purpose: "password_reset",
        otpHash: hashOtp(otp),
        expiresAt: otpExpiryDate(),
      });
      await sendPasswordResetEmail({ to: user.email, otp });
    }
  }

  return NextResponse.json(GENERIC_RESPONSE, { status: 200 });
}
