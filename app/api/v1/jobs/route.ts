import { NextResponse } from "next/server";
import { authenticate } from "@/lib/server/withApiAuth";
import { jobsCreateRequestSchema } from "@/lib/server/validation";
import { ApiError, errorResponse, internalErrorResponse } from "@/lib/server/apiErrors";
import { createJobRow, getJobById } from "@/lib/server/repository";
import { generateWebhookSecret } from "@/lib/server/webhooks";
import { publishJobProcessingMessage, qstashConfigured } from "@/lib/server/qstash";
import { processJob } from "@/lib/server/jobProcessor";
import type { JobV1 } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function toJobV1(job: NonNullable<Awaited<ReturnType<typeof getJobById>>>): JobV1 {
  return {
    jobId: job.id,
    status: job.status as JobV1["status"],
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    requestId: job.request_id,
    inputSummary: {
      keywords: job.input.keywords,
      language: job.input.language,
      maxWords: job.input.constraints.maxWords,
    },
    ...(job.result ? { result: job.result } : {}),
    ...(job.rendered ? { rendered: job.rendered } : {}),
    ...(job.error_code
      ? {
          error: {
            code: job.error_code as NonNullable<JobV1["error"]>["code"],
            message: job.error_message ?? "",
          },
        }
      : {}),
  };
}

export async function POST(req: Request) {
  const auth = await authenticate(req, {
    requiredScope: "jobs:create",
    consumeRateLimit: true,
  });
  if (!auth.ok) return auth.response;
  const { context, rateLimitHeaders } = auth;
  const { requestId, apiKey, customer } = context;

  try {
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");

    const parsed = jobsCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid request body.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    const input = parsed.data;
    const webhookSecret = input.webhook ? generateWebhookSecret() : undefined;

    const job = await createJobRow({
      customerId: customer.id,
      apiKeyId: apiKey.id,
      requestId,
      input: input.generateRequest,
      webhookUrl: input.webhook?.url,
      webhookEvents: input.webhook?.events,
      webhookSecret,
      idempotencyKey: input.idempotencyKey,
    });

    if (qstashConfigured()) {
      await publishJobProcessingMessage(job.id);
    } else {
      // No durable queue configured: process now, synchronously, rather than
      // claiming a background worker exists when it doesn't.
      await processJob(job.id);
    }

    const finalJob = await getJobById(job.id);
    const responseBody = {
      ...toJobV1(finalJob!),
      ...(webhookSecret ? { webhookSigningSecret: webhookSecret } : {}),
    };

    const res = NextResponse.json(responseBody, { status: 202 });
    res.headers.set("X-Request-ID", requestId);
    for (const [k, v] of Object.entries(rateLimitHeaders)) res.headers.set(k, v);
    return res;
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err, requestId);
    return internalErrorResponse(requestId, err);
  }
}
