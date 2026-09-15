import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, hashSessionToken } from "@/lib/server/session";
import { revokeSession } from "@/lib/server/repository";

export const runtime = "nodejs";

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await revokeSession(hashSessionToken(token)).catch(() => {});
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
