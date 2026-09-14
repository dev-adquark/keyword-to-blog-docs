import { NextResponse } from "next/server";
import { signupSchema } from "@/lib/server/validation";
import { hashPassword, passwordMeetsPolicy } from "@/lib/server/password";
import { createUserAndCustomer, findUserByEmail } from "@/lib/server/repository";
import { signSession, sessionCookieOptions, SESSION_COOKIE } from "@/lib/server/session";
import { env } from "@/lib/server/env";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let parsed;
  try {
    const body = await req.json();
    parsed = signupSchema.safeParse(body);
  } catch {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: "Please check your details and try again.",
      },
      { status: 400 }
    );
  }

  if (!parsed || !parsed.success) {
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
    return NextResponse.json(
      { code: "VALIDATION_ERROR", message: "Password must be at least 10 characters long." },
      { status: 400 }
    );
  }

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "An account with this email already exists." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);
    const { user } = await createUserAndCustomer({ name, email, passwordHash });

    const token = await signSession({ userId: user.id }, env.AUTH_SECRET);
    const res = NextResponse.json({ ok: true }, { status: 201 });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (err) {
    const message = err instanceof Error && /duplicate|unique|email/i.test(err.message)
      ? "An account with this email already exists."
      : "We couldn't create your account. Please try again.";
    const status = err instanceof Error && /duplicate|unique|email/i.test(err.message) ? 409 : 500;

    // eslint-disable-next-line no-console
    console.error("signup_error", {
      message: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      { code: status === 409 ? "VALIDATION_ERROR" : "INTERNAL_ERROR", message },
      { status }
    );
  }
}
