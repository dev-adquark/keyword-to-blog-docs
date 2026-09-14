import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { revokeApiKey } from "@/lib/server/repository";

export const runtime = "nodejs";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { customer } = await requireSession();
    const { id } = await params;
    // revokeApiKey filters by customer_id too, so one customer can never revoke another's key.
    const revoked = await revokeApiKey(id, customer.id);
    if (!revoked) {
      return NextResponse.json({ message: "Key not found." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authenticated" }, { status });
  }
}
