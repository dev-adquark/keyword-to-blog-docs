import "server-only";
import { createHmac, randomBytes } from "node:crypto";

export interface WebhookDeliveryResult {
  attempted: boolean;
  delivered: boolean;
}

/**
 * Sends a signed webhook. Signature scheme: HMAC-SHA256 over `${timestamp}.${body}`,
 * using a per-job one-time secret so the receiver can verify authenticity and
 * a timestamp so replayed deliveries can be rejected (events older than 5 min).
 */
export async function deliverWebhook(params: {
  url: string;
  event: "job.succeeded" | "job.failed";
  secret: string;
  payload: unknown;
}): Promise<WebhookDeliveryResult> {
  const body = JSON.stringify({ event: params.event, data: params.payload });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", params.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  try {
    const res = await fetch(params.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ktb-signature": `t=${timestamp},v1=${signature}`,
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    return { attempted: true, delivered: res.ok };
  } catch {
    return { attempted: true, delivered: false };
  }
}

export function generateWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}
