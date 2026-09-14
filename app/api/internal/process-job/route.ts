import { NextResponse } from "next/server";
import { verifyQstashSignature } from "@/lib/server/qstash";
import { processJob } from "@/lib/server/jobProcessor";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("upstash-signature");

  const valid = await verifyQstashSignature(signature, rawBody);
  if (!valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const { jobId } = JSON.parse(rawBody) as { jobId: string };
  await processJob(jobId);

  return NextResponse.json({ ok: true });
}
