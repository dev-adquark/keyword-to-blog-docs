import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { env, qstashConfigured } from "./env";

export { qstashConfigured };

export async function publishJobProcessingMessage(jobId: string): Promise<void> {
  const client = new Client({ token: env.QSTASH_TOKEN });
  const targetUrl = `${env.NEXT_PUBLIC_API_BASE_URL}/api/internal/process-job`;
  await client.publishJSON({
    url: targetUrl,
    body: { jobId },
    retries: 2,
  });
}

export async function verifyQstashSignature(
  signature: string | null,
  body: string
): Promise<boolean> {
  if (!signature) return false;
  const receiver = new Receiver({
    currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
  });
  try {
    return await receiver.verify({ signature, body });
  } catch {
    return false;
  }
}
