import "server-only";
import { Client, Receiver } from "@upstash/qstash";
import { env, qstashConfigured } from "./env";
import type { PlanConfig } from "@/lib/plans";

export { qstashConfigured };

/**
 * Real, deterministic priority processing using what QStash actually
 * offers: each plan gets its own flow-control key with `parallelism` set to
 * that plan's `maxConcurrentJobs`. Higher tiers can have more of their jobs
 * in flight at once — QStash enforces this itself — instead of every plan
 * silently sharing one undifferentiated queue.
 */
export async function publishJobProcessingMessage(
  jobId: string,
  plan: PlanConfig
): Promise<void> {
  const client = new Client({ token: env.QSTASH_TOKEN });
  const targetUrl = `${env.NEXT_PUBLIC_API_BASE_URL}/api/internal/process-job`;
  await client.publishJSON({
    url: targetUrl,
    body: { jobId },
    retries: 2,
    // Defense-in-depth against QStash-level redelivery duplicating a job —
    // on top of the atomic `claimJobForProcessing` DB guard.
    deduplicationId: jobId,
    flowControl: { key: `plan:${plan.id}`, parallelism: plan.maxConcurrentJobs },
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
