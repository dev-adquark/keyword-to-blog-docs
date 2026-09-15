import "server-only";
import { randomBytes, createHash } from "node:crypto";

export const SESSION_COOKIE = "ktb_session";

/**
 * Absolute server-side backstop on how long a session row stays valid — NOT
 * the cookie's lifetime. The cookie itself carries no Max-Age/Expires, so it
 * behaves as a true browser-session cookie (gone when the browser fully
 * closes); this bound only protects against a session that's never revoked
 * because the browser is simply never closed.
 */
const SESSION_ABSOLUTE_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

/** The random, opaque token that goes in the cookie. Never stored raw. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What's actually persisted server-side — a leaked DB row can't be replayed as a session. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiryDate(): Date {
  return new Date(Date.now() + SESSION_ABSOLUTE_TTL_SECONDS * 1000);
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  // Deliberately no maxAge/expires.
};
