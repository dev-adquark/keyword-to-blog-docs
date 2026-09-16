import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth";
import { AuditClient } from "./AuditClient";

export default async function AuditPage() {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "OWNER") {
    redirect("/dashboard");
  }
  return <AuditClient />;
}
