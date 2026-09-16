import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth";
import { MemberClient } from "./MemberClient";

export default async function TeamMemberPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "OWNER") {
    redirect("/dashboard");
  }
  const { userId } = await params;
  return <MemberClient userId={userId} />;
}
