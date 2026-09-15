import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/server/validation";
import { hashPassword, passwordMeetsPolicy } from "@/lib/server/password";
import { createUserAndCustomer, findUserByEmail, createOtp } from "@/lib/server/repository";
import { generateOtp, hashOtp, otpExpiryDate } from "@/lib/server/otp";
import { sendVerificationEmail } from "@/lib/server/authEmail";
import { env } from "@/lib/server/env";
import { notifyOwner, safeAfter } from "@/lib/server/notifications";
import { consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";
import { DEFAULT_PLAN_ID } from "@/lib/plans";

export const runtime = "nodejs";

function getSignupAuthSecret(): string {
  try {
    return env.AUTH_SECRET;
  } catch (err) {
    console.error("signup_debug", {
      step: "auth_secret_missing",
      message: err instanceof Error ? err.message : String(err),
    });
    throw new Error("AUTH_SECRET_NOT_CONFIGURED");
  }
}

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:signup:ip:${ip}`, 10, 60 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", message: "Too many signup attempts. Please try again later." },
      { status: 429 }
    );
  }

  let parsed;
  try {
    const body = await req.json();
    parsed = signupSchema.safeParse(body);
    console.info("signup_debug", {
      step: "request_validation",
      valid: parsed.success,
      inputKeys: body && typeof body === "object" ? Object.keys(body) : [],
    });
  } catch {
    console.info("signup_debug", { step: "request_validation_failed" });
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Please check your details and try again.",
      },
      { status: 400 }
    );
  }

  if (!parsed || !parsed.success) {
    console.info("signup_debug", {
      step: "request_validation_failed",
      issues: parsed?.error.issues.map((issue) => ({ path: issue.path, message: issue.message })) ?? [],
    });
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message:
          parsed?.error.issues[0]?.message ?? "Please check your details and try again.",
      },
      { status: 400 }
    );
  }

  const { name, email, password } = parsed.data;

  if (!passwordMeetsPolicy(password)) {
    console.info("signup_debug", { step: "password_policy_failed", emailLength: email.length });
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Password must be at least 10 characters long." },
      { status: 400 }
    );
  }

  try {
    getSignupAuthSecret();
    console.info("signup_debug", { step: "auth_secret_ready" });

    const existing = await findUserByEmail(email);
    if (existing) {
      console.info("signup_debug", { step: "existing_user_found" });
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    console.info("signup_debug", { step: "password_hash_start" });
    const passwordHash = await hashPassword(password);
    console.info("signup_debug", { step: "password_hash_complete" });

    console.info("signup_debug", { step: "user_customer_insert_start" });
    const { user } = await createUserAndCustomer({ name, email, passwordHash });
    console.info("signup_debug", { step: "user_customer_insert_complete", userId: user.id });

    // Email verification is mandatory before any session is issued — the
    // account exists but stays unverified/unauthenticated until the OTP
    // below is confirmed via POST /api/auth/verify-email.
    const otp = generateOtp();
    await createOtp({
      userId: user.id,
      purpose: "email_verification",
      otpHash: hashOtp(otp),
      expiresAt: otpExpiryDate(),
    });
    const emailResult = await sendVerificationEmail({ to: user.email, otp });
    console.info("signup_debug", { step: "verification_email_sent", ok: emailResult.ok });

    const signedUpAt = new Date().toISOString();
    safeAfter(() =>
      notifyOwner({
        type: "USER_SIGNED_UP",
        userId: user.id,
        email: user.email,
        name: user.name,
        plan: DEFAULT_PLAN_ID,
        signedUpAt,
      })
    );

    return NextResponse.json({ ok: true, email: user.email }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error && /duplicate|unique|email/i.test(err.message)
      ? "An account with this email already exists."
      : "We couldn't create your account. Please try again.";
    const status = err instanceof Error && /duplicate|unique|email/i.test(err.message) ? 409 : 500;

    console.error("signup_error", {
      step: "signup_failed",
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      { code: status === 409 ? "VALIDATION_ERROR" : "INTERNAL_ERROR", message },
      { status }
    );
  }
}
