import { NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/server/rbac";
import { listRecentAuditEvents } from "@/lib/server/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireOwnerSession();
    const events = await listRecentAuditEvents(200);
    return NextResponse.json({
      events: events.map((e) => ({
        id: e.id,
        eventType: e.event_type,
        actorEmail: e.actor_email,
        targetUserEmail: e.target_user_email,
        targetApiKeyPrefix: e.target_api_key_prefix,
        metadata: e.metadata,
        ip: e.ip,
        createdAt: e.created_at,
      })),
    });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authorized." }, { status });
  }
}
