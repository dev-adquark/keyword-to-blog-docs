import { NextResponse } from "next/server";
import { authenticate } from "@/lib/server/withApiAuth";
import { generateRequestSchema } from "@/lib/server/validation";
import { ApiError, errorResponse, internalErrorResponse } from "@/lib/server/apiErrors";
import { getAIProvider } from "@/lib/server/generation/anthropic";
import {
  recordUsageEvent,
  findIdempotencyRecord,
  saveIdempotencyRecord,
} from "@/lib/server/repository";
import type { GenerateResponseV1 } from "@/lib/types";
import { createHash } from "node:crypto";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const auth = await authenticate(req, {
    requiredScope: "generate",
    consumeRateLimit: true,
  });
  if (!auth.ok) return auth.response;

  const { context, rateLimitHeaders } = auth;
  const { requestId, apiKey, customer } = context;
  const started = Date.now();

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON.");
    }

    const parsed = generateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError("VALIDATION_ERROR", "Invalid request body.", {
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      });
    }
    const generateRequest = parsed.data;

    // Idempotency: same key + same request body -> return the prior response, no double generation.
    const idempotencyKey =
      req.headers.get("idempotency-key") || generateRequest.idempotencyKey;
    const requestHash = createHash("sha256")
      .update(JSON.stringify(generateRequest))
      .digest("hex");

    if (idempotencyKey) {
      const existing = await findIdempotencyRecord(apiKey.id, idempotencyKey);
      if (existing) {
        if (existing.request_hash !== requestHash) {
          throw new ApiError(
            "VALIDATION_ERROR",
            "Idempotency-Key was already used with a different request body."
          );
        }
        const res = NextResponse.json(existing.response, {
          status: existing.status_code,
        });
        res.headers.set("X-Request-ID", requestId);
        for (const [k, v] of Object.entries(rateLimitHeaders)) res.headers.set(k, v);
        return res;
      }
    }

    const provider = getAIProvider();
    const post = await provider.generate(generateRequest);
    const words = post.sections.reduce(
      (sum, s) => sum + s.contentMarkdown.split(/\s+/).filter(Boolean).length,
      0
    );

    const responseBody: GenerateResponseV1 = {
      requestId,
      post,
      rendered: {
        ...(generateRequest.format.responseTypes.includes("markdown")
          ? { markdown: renderMarkdown(post) }
          : {}),
        ...(generateRequest.format.responseTypes.includes("json") ? { rawJson: post } : {}),
      },
      debug: { generationModel: process.env.AI_MODEL || "claude-sonnet-5" },
    };

    await recordUsageEvent({
      apiKeyId: apiKey.id,
      customerId: customer.id,
      endpoint: "/v1/generate",
      requestId,
      statusCode: 200,
      success: true,
      words,
      durationMs: Date.now() - started,
      countedTowardQuota: true,
    });

    if (idempotencyKey) {
      await saveIdempotencyRecord({
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
      statusCode: err instanceof ApiError ? 400 : 500,
      success: false,
      words: 0,
      durationMs: Date.now() - started,
      countedTowardQuota: false,
    }).catch(() => {});

    if (err instanceof ApiError) return errorResponse(err, requestId);
    return internalErrorResponse(requestId, err);
  }
}
