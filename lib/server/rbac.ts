import "server-only";
import { requireSession, type CurrentSession } from "./auth";

export { TEAM_ROLES, isValidTeamRole } from "./repository";

/**
 * For OWNER-only dashboard routes/pages. Authorization is derived entirely
 * from the server-side session's role — never from anything the client
 * sends — so hiding a button on the frontend is never the only thing
 * standing between a non-OWNER user and this data.
 */
export async function requireOwnerSession(): Promise<CurrentSession> {
  const session = await requireSession();
  if (session.user.role !== "OWNER") {
    throw Object.assign(new Error("Forbidden — OWNER access required."), { status: 403 });
  }
  return session;
}
