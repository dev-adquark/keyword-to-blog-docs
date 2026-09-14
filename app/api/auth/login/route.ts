import { NextResponse } from "next/server";
import { loginSchema } from "@/lib/server/validation";
import { verifyPassword } from "@/lib/server/password";
import { findUserByEmail } from "@/lib/server/repository";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/server/session";
import { env } from "@/lib/server/env";

export const runtime = "nodejs";

const GENERIC_ERROR = { code: "AUTH_INVALID", message: "Invalid email or password." };

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
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json(GENERIC_ERROR, { status: 401 });
  }

  const token = await signSession({ userId: user.id }, env.AUTH_SECRET);
  const res = NextResponse.json({ ok: true }, { status: 200 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
  return res;
}
