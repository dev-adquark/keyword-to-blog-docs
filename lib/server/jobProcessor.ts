import "server-only";
import {
  getJobById,
  claimJobForProcessing,
  markJobSucceeded,
  markJobFailed,
  recordUsageEvent,
  recordContentQualityReport,
  createWebhookDeliveryRecord,
  updateWebhookDeliveryRecord,
  type JobRow,
} from "./repository";
import { runContentQualityPipeline, ContentQualityFailedError, toQualitySummary } from "./content-quality/engine";
import { deliverWebhook } from "./webhooks";
import { ApiError } from "./apiErrors";
import { renderMarkdown, renderHtml, countWords } from "./postRender";
import type { WebhookSucceededPayloadV1, WebhookFailedPayloadV1 } from "@/lib/types";

async function sendJobWebhook(
  job: JobRow,
  payload: WebhookSucceededPayloadV1 | WebhookFailedPayloadV1
): Promise<void> {
  if (!job.webhook_url || !job.webhook_secret) return;
  if (!job.webhook_events.includes(payload.event)) return;

  const record = await createWebhookDeliveryRecord({
    jobId: job.id,
    event: payload.event,
    url: job.webhook_url,
  });

  const result = await deliverWebhook({
    url: job.webhook_url,
    secret: job.webhook_secret,
    payload,
  });

  await updateWebhookDeliveryRecord(record.id, {
    status: !result.attempted ? "blocked" : result.delivered ? "delivered" : "failed",
    attempts: result.attempts,
    lastStatusCode: result.lastStatusCode,
    lastError: result.lastError,
  });
}

export async function processJob(jobId: string): Promise<JobRow | null> {
  // Atomic claim: if another invocation (e.g. a QStash redelivery racing
  // this one) already claimed this job, `claimed` is null and we stop here
  // instead of generating/billing a second time for the same job.
  const claimed = await claimJobForProcessing(jobId);
  if (!claimed) return getJobById(jobId);

  const job = claimed;
  const started = Date.now();

  try {
    const { post, report } = await runContentQualityPipeline(job.input, job.request_id);
    const words = countWords(post);

    recordContentQualityReport({
      requestId: job.request_id,
      jobId,
      customerId: job.customer_id,
      apiKeyId: job.api_key_id,
      overallStatus: "PASS",
      report,
    }).catch(() => {});

    const responseTypes = job.input.format.responseTypes;
    const rendered = {
      ...(responseTypes.includes("markdown") ? { markdown: renderMarkdown(post) } : {}),
      ...(responseTypes.includes("html") ? { html: renderHtml(post) } : {}),
    };

    await markJobSucceeded(jobId, post, rendered, toQualitySummary(report));
    await recordUsageEvent({
      apiKeyId: job.api_key_id,
      customerId: job.customer_id,
      endpoint: "/v1/jobs",
      requestId: job.request_id,
      statusCode: 200,
      success: true,
      words,
      posts: 1,
      durationMs: Date.now() - started,
      countedTowardQuota: true,
    });

    await sendJobWebhook(job, {
      event: "job.succeeded",
      jobId,
      requestId: job.request_id,
      post,
      rendered,
      quality: toQualitySummary(report),
    });
  } catch (err) {
    const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
    const message =
      err instanceof ApiError ? err.message : "Content generation failed.";

    if (err instanceof ContentQualityFailedError) {
      recordContentQualityReport({
        requestId: job.request_id,
        jobId,
        customerId: job.customer_id,
        apiKeyId: job.api_key_id,
        overallStatus: "FAIL",
        report: err.report,
      }).catch(() => {});
    }

    await markJobFailed(jobId, code, message);
    await recordUsageEvent({
      apiKeyId: job.api_key_id,
      customerId: job.customer_id,
      endpoint: "/v1/jobs",
      requestId: job.request_id,
      statusCode: 500,
      success: false,
      words: 0,
      posts: 0,
      durationMs: Date.now() - started,
      countedTowardQuota: false,
    }).catch(() => {});

    await sendJobWebhook(job, {
      event: "job.failed",
      jobId,
      requestId: job.request_id,
      error: { code, message },
    }).catch(() => {});
  }

  return getJobById(jobId);
}
