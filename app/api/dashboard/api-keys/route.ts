import { NextResponse } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { createApiKeySchema } from "@/lib/server/validation";
import { generateApiKey } from "@/lib/server/apiKey";
import { insertApiKey, listApiKeysForCustomer } from "@/lib/server/repository";
import { getPlan } from "@/lib/plans";

export const runtime = "nodejs";

function serializeKey(row: {
  id: string;
  key_prefix: string;
  name: string;
  environment: string;
  scopes: string[];
  status: string;
  created_at: string;
  last_used_at: string | null;
}) {
  return {
    id: row.id,
    prefix: row.key_prefix,
    name: row.name,
    environment: row.environment,
    scopes: row.scopes,
    status: row.status,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export async function GET() {
  try {
    const { customer } = await requireSession();
    const keys = await listApiKeysForCustomer(customer.id);
    return NextResponse.json({ keys: keys.map(serializeKey) });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authenticated" }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { customer } = await requireSession();
    const body = await req.json().catch(() => null);
    const parsed = body ? createApiKeySchema.safeParse(body) : null;
    if (!parsed || !parsed.success) {
      return NextResponse.json(
        { code: "VALIDATION_ERROR", message: "A key name is required." },
        { status: 400 }
      );
    }

    const plan = getPlan(customer.plan);
    const scopes = parsed.data.scopes?.length ? parsed.data.scopes : plan.defaultScopes;

    const generated = generateApiKey(parsed.data.environment);
    const row = await insertApiKey({
      customerId: customer.id,
      keyPrefix: generated.prefix,
      keyHash: generated.hash,
      name: parsed.data.name,
      environment: generated.environment,
      scopes,
    });

    // The raw secret is returned exactly once, here, and is never persisted or retrievable again.
    return NextResponse.json(
      { key: { ...serializeKey(row), rawKey: generated.raw } },
      { status: 201 }
    );
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    return NextResponse.json({ message: "Not authenticated" }, { status });
  }
}
