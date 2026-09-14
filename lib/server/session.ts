import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "ktb_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

function secretKey(authSecret: string) {
  return new TextEncoder().encode(authSecret);
}

export interface SessionPayload {
  userId: string;
  [key: string]: unknown;
}

export async function signSession(
  payload: SessionPayload,
  authSecret: string
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey(authSecret));
}

export async function verifySession(
  token: string,
  authSecret: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(authSecret));
    if (typeof payload.userId !== "string") return null;
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
};
