import { NextResponse } from "next/server";
import { authenticate } from "@/lib/server/withApiAuth";
import { generateRequestSchema } from "@/lib/server/validation";
import { ApiError, errorResponse, internalErrorResponse, statusForError } from "@/lib/server/apiErrors";
import { runContentQualityPipeline, ContentQualityFailedError, toQualitySummary } from "@/lib/server/content-quality/engine";
import {
  recordUsageEvent,
  recordContentQualityReport,
  claimIdempotencyRequest,
  updateIdempotencyRecord,
} from "@/lib/server/repository";
import type { GenerateResponseV1 } from "@/lib/types";
import { env } from "@/lib/server/env";
import { readJsonBodyWithSizeLimit } from "@/lib/server/requestBody";
import { renderMarkdown, renderHtml, countWords } from "@/lib/server/postRender";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const auth = await authenticate(req, {
    requiredScope: "generate",
    consumeRateLimit: true,
  });
  if (!auth.ok) return auth.response;

  const { context, rateLimitHeaders } = auth;
  const { requestId, apiKey, customer } = context;
  const started = Date.now();
  let generateRequest: Awaited<ReturnType<typeof generateRequestSchema.safeParse>>["data"] | null = null;
  let idempotencyKey: string | null = null;
  let requestHash = "";
  let claimedIdempotency = false;

  try {
    const body = await readJsonBodyWithSizeLimit(req);
    if (!body) {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid request body.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    generateRequest = parsed.data;

    if (generateRequest.constraints.maxWords !== undefined && generateRequest.constraints.maxWords > context.plan.maxWordsPerRequest) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `constraints.maxWords exceeds the plan limit of ${context.plan.maxWordsPerRequest} words per request.`,
        {
          field: "constraints.maxWords",
          maxAllowed: context.plan.maxWordsPerRequest,
          received: generateRequest.constraints.maxWords,
        }
      );
    }

    // Idempotency: claim the key atomically before generation so concurrent identical
    // requests cannot both bill/trigger AI generation. Replays return the same stored response.
    const explicitIdempotencyKey = req.headers.get("idempotency-key");
    idempotencyKey = explicitIdempotencyKey ?? generateRequest.idempotencyKey ?? null;
    requestHash = createHash("sha256")
      .update(JSON.stringify(generateRequest))
      .digest("hex");

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

    const { post, report } = await runContentQualityPipeline(generateRequest, requestId);
    const words = countWords(post);

    recordContentQualityReport({
      requestId,
      customerId: customer.id,
      apiKeyId: apiKey.id,
      overallStatus: "PASS",
      report,
    }).catch(() => {});

    const responseBody: GenerateResponseV1 = {
      requestId,
      post,
      rendered: {
        ...(generateRequest.format.responseTypes.includes("markdown")
          ? { markdown: renderMarkdown(post) }
          : {}),
        ...(generateRequest.format.responseTypes.includes("html")
          ? { html: renderHtml(post) }
          : {}),
        ...(generateRequest.format.responseTypes.includes("json") ? { rawJson: post } : {}),
      },
      debug: { generationModel: env.AI_MODEL },
      quality: toQualitySummary(report),
    };

    await recordUsageEvent({
      apiKeyId: apiKey.id,
      customerId: customer.id,
      endpoint: "/v1/generate",
      requestId,
      statusCode: 200,
      success: true,
      words,
      posts: 1,
      durationMs: Date.now() - started,
      countedTowardQuota: true,
    });

    if (idempotencyKey) {
      await updateIdempotencyRecord({
        apiKeyId: apiKey.id,
        idempotencyKey,
        requestHash,
        response: responseBody,
        statusCode: 200,
      });
    }

    const res = NextResponse.json(responseBody, { status: 200 });
    res.headers.set("X-Request-ID", requestId);
    for (const [k, v] of Object.entries(rateLimitHeaders)) res.headers.set(k, v);
    return res;
  } catch (err) {
    await recordUsageEvent({
      apiKeyId: apiKey.id,
      customerId: customer.id,
      endpoint: "/v1/generate",
      requestId,
      statusCode: statusForError(err),
      success: false,
      words: 0,
      durationMs: Date.now() - started,
      countedTowardQuota: false,
    }).catch(() => {});

    if (err instanceof ContentQualityFailedError) {
      recordContentQualityReport({
        requestId,
        customerId: customer.id,
        apiKeyId: apiKey.id,
        overallStatus: "FAIL",
        report: err.report,
      }).catch(() => {});
    }

    if (idempotencyKey && claimedIdempotency && generateRequest) {
      await updateIdempotencyRecord({
        apiKeyId: apiKey.id,
        idempotencyKey,
        requestHash: createHash("sha256")
          .update(JSON.stringify(generateRequest))
          .digest("hex"),
        response: {
          error: err instanceof ApiError ? err.code : "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "Generation failed.",
        },
        statusCode: statusForError(err),
      }).catch(() => {});
    }

    if (err instanceof ApiError) return errorResponse(err, requestId);
    return internalErrorResponse(requestId, err);
  }
}
