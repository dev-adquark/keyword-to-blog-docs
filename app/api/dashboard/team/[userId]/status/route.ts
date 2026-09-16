import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwnerSession } from "@/lib/server/rbac";
import { findUserById, updateUserStatus, recordAuditEvent } from "@/lib/server/repository";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

const bodySchema = z.object({ status: z.enum(["active", "disabled"]) });

export async function POST(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { user: actor } = await requireOwnerSession();
    const { userId } = await params;

    const target = await findUserById(userId);
    if (!target) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }
    if (target.role === "OWNER" && target.id !== actor.id) {
      // Owners can't lock each other out from the UI — a deliberate guardrail
      // against accidentally disabling the only other admin.
      return NextResponse.json(
        { code: "FORBIDDEN", message: "Cannot disable another OWNER account from here." },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    const parsed = body ? bodySchema.safeParse(body) : null;
    if (!parsed || !parsed.success) {
      return NextResponse.json({ code: "VALIDATION_ERROR", message: "Invalid status." }, { status: 400 });
    }

    const updated = await updateUserStatus(userId, parsed.data.status);
    if (!updated) {
      return NextResponse.json({ message: "Not found." }, { status: 404 });
    }

    await recordAuditEvent({
      eventType: "user_status_changed",
      actorUserId: actor.id,
      targetUserId: userId,
      metadata: { status: parsed.data.status },
      ip: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true, status: updated.status });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authorized." }, { status });
  }
}
