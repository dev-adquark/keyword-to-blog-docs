import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, hashSessionToken } from "./session";
import {
  findActiveSessionByTokenHash,
  touchSession,
  findUserById,
  findCustomerByUserId,
  isValidTeamRole,
  type UserRow,
  type CustomerRow,
} from "./repository";

export interface CurrentSession {
  user: UserRow;
  customer: CustomerRow;
}

/** Returns the signed-in user + customer, or null if there's no valid, unrevoked session. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await findActiveSessionByTokenHash(hashSessionToken(token));
  if (!session) return null;

  const user = await findUserById(session.user_id);
  if (!user || user.status !== "active" || !isValidTeamRole(user.role)) return null;

  const customer = await findCustomerByUserId(user.id);
  if (!customer) return null;

  touchSession(session.id).catch(() => {});

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
