import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/server/validation";
import { verifyPassword } from "@/lib/server/password";
import { findUserByEmail } from "@/lib/server/repository";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/server/session";
import { env } from "@/lib/server/env";
import { notifyOwner, recordRepeatedViolation, safeAfter } from "@/lib/server/notifications";

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
  const body = await req.json().catch(() => null);
  const parsed = body ? loginSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const { email, password } = parsed.data;
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

  const token = await signSession({ userId: user.id }, env.AUTH_SECRET);
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
