import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./session";
import { env } from "./env";
import { findUserById, findCustomerByUserId, type UserRow, type CustomerRow } from "./repository";

export interface CurrentSession {
  user: UserRow;
  customer: CustomerRow;
}

/** Returns the signed-in user + customer, or null if there's no valid session. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = await verifySession(token, env.AUTH_SECRET);
  if (!payload) return null;

  const user = await findUserById(payload.userId);
  if (!user || user.status !== "active") return null;

  const customer = await findCustomerByUserId(user.id);
  if (!customer) return null;

  return { user, customer };
}

/** For internal dashboard API routes: returns the session or throws a 401-shaped error. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw Object.assign(new Error("Not authenticated"), { status: 401 });
  }
  return session;
}
