import { NextResponse } from "next/server";
import { authenticate } from "@/lib/server/withApiAuth";
import { jobsCreateRequestSchema } from "@/lib/server/validation";
import { ApiError, errorResponse, internalErrorResponse } from "@/lib/server/apiErrors";
import {
  createJobRow,
  getJobById,
  markJobFailed,
  claimIdempotencyRequest,
  updateIdempotencyRecord,
} from "@/lib/server/repository";
import { generateWebhookSecret } from "@/lib/server/webhooks";
import { publishJobProcessingMessage, qstashConfigured } from "@/lib/server/qstash";
import { processJob } from "@/lib/server/jobProcessor";
import { readJsonBodyWithSizeLimit } from "@/lib/server/requestBody";
import type { JobV1 } from "@/lib/types";
import { createHash } from "node:crypto";

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
  const { requestId, apiKey, customer, plan } = context;
  let idempotencyKey: string | null = null;
  let requestHash = "";
  let claimedIdempotency = false;

  try {
    const body = await readJsonBodyWithSizeLimit(req);
    if (!body) throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");

    const parsed = jobsCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid request body.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    const input = parsed.data;

    if (input.generateRequest.constraints.maxWords > context.plan.maxWordsPerRequest) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `constraints.maxWords exceeds the plan limit of ${context.plan.maxWordsPerRequest} words per request.`,
        {
          field: "generateRequest.constraints.maxWords",
          maxAllowed: context.plan.maxWordsPerRequest,
          received: input.generateRequest.constraints.maxWords,
        }
      );
    }

    // Idempotency: same atomic claim-then-replay pattern as /v1/generate —
    // a repeated Idempotency-Key with the same body returns the original
    // job instead of creating (and billing) a second one.
    const explicitIdempotencyKey = req.headers.get("idempotency-key");
    idempotencyKey = explicitIdempotencyKey ?? input.idempotencyKey ?? null;
    requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");

    if (idempotencyKey) {
      const claim = await claimIdempotencyRequest({
        apiKeyId: apiKey.id,
        idempotencyKey,
        requestHash,
        response: { status: "processing" },
        statusCode: 202,
      });
      claimedIdempotency = claim.claimed;

      if (!claim.claimed && claim.existing) {
        if (claim.existing.request_hash !== requestHash) {
          throw new ApiError(
            "VALIDATION_ERROR",
            "Idempotency-Key was already used with a different request body."
          );
        }
        const res = NextResponse.json(claim.existing.response, {
          status: claim.existing.status_code,
        });
        res.headers.set("X-Request-ID", requestId);
        for (const [k, v] of Object.entries(rateLimitHeaders)) res.headers.set(k, v);
        return res;
      }
    }

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
      try {
        await publishJobProcessingMessage(job.id, plan);
      } catch (err) {
        // The job row already exists — never leave it silently stuck in
        // "queued" with no way for the caller to know processing was never
        // enqueued. Mark it failed so GET /v1/jobs/:jobId reports a terminal
        // state instead of polling forever.
        await markJobFailed(
          job.id,
          "INTERNAL_ERROR",
          "Failed to enqueue the job for processing. Please try again."
        );
        console.error(
          JSON.stringify({
            level: "error",
            message: "job_enqueue_failed",
            jobId: job.id,
            error: err instanceof Error ? err.message : String(err),
          })
        );
      }
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

    if (idempotencyKey) {
      await updateIdempotencyRecord({
        apiKeyId: apiKey.id,
        idempotencyKey,
        requestHash,
        response: responseBody,
        statusCode: 202,
      });
    }

    const res = NextResponse.json(responseBody, { status: 202 });
    res.headers.set("X-Request-ID", requestId);
    for (const [k, v] of Object.entries(rateLimitHeaders)) res.headers.set(k, v);
    return res;
  } catch (err) {
    if (idempotencyKey && claimedIdempotency) {
      await updateIdempotencyRecord({
        apiKeyId: apiKey.id,
        idempotencyKey,
        requestHash,
        response: {
          error: err instanceof ApiError ? err.code : "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Job creation failed.",
        },
        statusCode: err instanceof ApiError ? 400 : 500,
      }).catch(() => {});
    }

    if (err instanceof ApiError) return errorResponse(err, requestId);
    return internalErrorResponse(requestId, err);
  }
}
