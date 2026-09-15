import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/server/validation";
import { verifyPassword } from "@/lib/server/password";
import { findUserByEmail, createSession } from "@/lib/server/repository";
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  generateSessionToken,
  hashSessionToken,
  sessionExpiryDate,
} from "@/lib/server/session";
import { notifyOwner, recordRepeatedViolation, safeAfter } from "@/lib/server/notifications";
import { consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

const GENERIC_ERROR = { code: "AUTH_INVALID", message: "Invalid email or password." };

/** Best-effort owner alert for repeated failed logins against one email — never blocks the request. */
function alertOnRepeatedLoginFailure(email: string): void {
  safeAfter(async () => {
    const { shouldNotify, approxCount, windowMinutes } = await recordRepeatedViolation({
      kind: "login_failure",
      key: email.toLowerCase(),
    });
    if (!shouldNotify) return;
    await notifyOwner({
      type: "SUSPICIOUS_LOGIN_FAILURES",
      email,
      approxCount,
      windowMinutes,
    });
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:login:ip:${ip}`, 20, 15 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", message: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = body ? loginSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const { email, password } = parsed.data;

  // Per-email brute-force gate, on top of the per-IP one above.
  const emailLimit = await consumeFixedWindowLimit(
    `rl:login:email:${email.toLowerCase()}`,
    10,
    15 * 60
  );
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", message: "Too many login attempts. Please try again later." },
      { status: 429 }
    );
  }

  const user = await findUserByEmail(email);
  if (!user || user.status !== "active") {
    // Same response whether the email exists or not — avoids account enumeration.
    alertOnRepeatedLoginFailure(email);
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    alertOnRepeatedLoginFailure(email);
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  if (!user.email_verified_at) {
    return NextResponse.json(
      {
        code: "EMAIL_NOT_VERIFIED",
        message: "Your email is not verified.",
        email: user.email,
      },
      { status: 403 }
    );
  }

  const rawToken = generateSessionToken();
  await createSession({
    userId: user.id,
    tokenHash: hashSessionToken(rawToken),
    expiresAt: sessionExpiryDate(),
  });

  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, rawToken, sessionCookieOptions);
  return res;
}
