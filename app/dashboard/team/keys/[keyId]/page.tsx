import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/auth";
import { KeyClient } from "./KeyClient";

export default async function TeamApiKeyPage({
  params,
}: {
  params: Promise<{ keyId: string }>;
}) {
  const session = await getCurrentSession();
  if (!session || session.user.role !== "OWNER") {
    redirect("/dashboard");
  }
  const { keyId } = await params;
  return <KeyClient keyId={keyId} />;
}
