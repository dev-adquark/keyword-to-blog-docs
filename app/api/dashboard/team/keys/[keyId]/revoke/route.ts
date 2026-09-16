import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/server/rbac";
import { revokeApiKeyAsOwner, recordAuditEvent } from "@/lib/server/repository";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ keyId: string }> }) {
  try {
    const { user: actor } = await requireOwnerSession();
    const { keyId } = await params;

    const revoked = await revokeApiKeyAsOwner(keyId);
    if (!revoked) {
      return NextResponse.json({ message: "Key not found or already revoked." }, { status: 404 });
    }

    await recordAuditEvent({
      eventType: "api_key_revoked",
      actorUserId: actor.id,
      targetApiKeyId: keyId,
      ip: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authorized." }, { status });
  }
}
