import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { accessRequestSchema } from "@/lib/server/validation";
import { createAccessRequest, listAccessRequestsForCustomer } from "@/lib/server/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { customer } = await requireSession();
    const requests = await listAccessRequestsForCustomer(customer.id);
    return NextResponse.json({ requests });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authenticated" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { customer } = await requireSession();
    const body = await req.json().catch(() => null);
    const parsed = body ? accessRequestSchema.safeParse(body) : null;
    if (!parsed || !parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "Please choose a plan to request." },
        { status: 400 }
      );
    }
    await createAccessRequest({
      customerId: customer.id,
      requestedPlan: parsed.data.requestedPlan,
      reason: parsed.data.reason,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authenticated" }, { status });
  }
}
