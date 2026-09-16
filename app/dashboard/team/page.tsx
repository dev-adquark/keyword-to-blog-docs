import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth";
import { TeamClient } from "./TeamClient";

// OWNER-only page. Authorization is enforced here server-side (and again by
// every API route this page calls) — never only by hiding a nav link.
export default async function TeamPage() {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "OWNER") {
    redirect("/dashboard");
  }
  return <TeamClient />;
}
