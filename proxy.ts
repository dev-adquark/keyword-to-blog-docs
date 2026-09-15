import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, hashSessionToken } from "@/lib/server/session";
import { findActiveSessionByTokenHash } from "@/lib/server/repository";

// `proxy` runs on the Node.js runtime in Next 16 (not Edge), so a real,
// revocable, DB-backed session check runs on every matched request instead
// of a stateless signature check — logout and password-reset invalidation
// take effect immediately, everywhere, not just once a JWT happens to expire.
export const config = {
  matcher: ["/dashboard/:path*", "/login", "/signup"],
};

export async function proxy(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await findActiveSessionByTokenHash(hashSessionToken(token)) : null;

  const { pathname } = req.nextUrl;
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  if (isAuthPage) {
    // An already-authenticated user shouldn't see a login/signup form.
    return session ? NextResponse.redirect(new URL("/dashboard", req.url)) : NextResponse.next();
  }

  if (!session) {
    return redirectToLogin(req);
  }

  return NextResponse.next();
}

function redirectToLogin(req: NextRequest) {
  const url = new URL("/login", req.url);
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}
