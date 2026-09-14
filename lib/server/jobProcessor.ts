import "server-only";
import {
  getJobById,
  markJobProcessing,
  markJobSucceeded,
  markJobFailed,
  recordUsageEvent,
  type JobRow,
} from "./repository";
import { getAIProvider } from "./generation/anthropic";
import { deliverWebhook } from "./webhooks";
import { ApiError } from "./apiErrors";

function renderMarkdown(post: {
  outline: { h1: string };
  sections: Array<{ heading?: string; contentMarkdown: string }>;
  conclusion: string;
}): string {
  const parts = [`# ${post.outline.h1}`];
  for (const s of post.sections) {
    if (s.heading) parts.push(`## ${s.heading}`);
    parts.push(s.contentMarkdown);
  }
  parts.push(post.conclusion);
  return parts.join("\n\n");
}

export async function processJob(jobId: string): Promise<JobRow | null> {
  const job = await getJobById(jobId);
  if (!job || job.status !== "queued") return job;

  await markJobProcessing(jobId);
  const started = Date.now();

  try {
    const provider = getAIProvider();
    const post = await provider.generate(job.input);
    const words = post.sections.reduce(
      (sum, s) => sum + s.contentMarkdown.split(/\s+/).filter(Boolean).length,
      0
    );
    const rendered = {
      markdown: job.input.format.responseTypes.includes("markdown")
        ? renderMarkdown(post)
        : undefined,
    };

    await markJobSucceeded(jobId, post, rendered);
    await recordUsageEvent({
      apiKeyId: job.api_key_id,
      customerId: job.customer_id,
      endpoint: "/v1/jobs",
      requestId: job.request_id,
      statusCode: 200,
      success: true,
      words,
      durationMs: Date.now() - started,
      countedTowardQuota: true,
    });

    if (job.webhook_url && job.webhook_secret) {
      await deliverWebhook({
        url: job.webhook_url,
        event: "job.succeeded",
        secret: job.webhook_secret,
        payload: { jobId, status: "succeeded", post },
      });
    }
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
    const message =
      err instanceof ApiError ? err.message : "Content generation failed.";
    await markJobFailed(jobId, code, message);
    await recordUsageEvent({
      apiKeyId: job.api_key_id,
      customerId: job.customer_id,
      endpoint: "/v1/jobs",
      requestId: job.request_id,
      statusCode: 500,
      success: false,
      words: 0,
      durationMs: Date.now() - started,
      countedTowardQuota: false,
    }).catch(() => {});

    if (job.webhook_url && job.webhook_secret) {
      await deliverWebhook({
        url: job.webhook_url,
        event: "job.failed",
        secret: job.webhook_secret,
        payload: { jobId, status: "failed", error: { code, message } },
      });
    }
  }

  return getJobById(jobId);
}
