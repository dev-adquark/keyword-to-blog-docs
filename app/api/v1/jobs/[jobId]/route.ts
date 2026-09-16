import { NextResponse } from "next/server";
import { authenticate } from "@/lib/server/withApiAuth";
import { ApiError, errorResponse, internalErrorResponse } from "@/lib/server/apiErrors";
import { getJobById } from "@/lib/server/repository";
import type { JobV1 } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await authenticate(req, {
    requiredScope: "jobs:read",
    consumeRateLimit: false,
  });
  if (!auth.ok) return auth.response;
  const { context } = auth;
  const { requestId, customer } = context;
  const { jobId } = await params;

  try {
    const job = await getJobById(jobId);

    // Ownership check: a job that exists but belongs to a different customer
    // must look identical to a job that doesn't exist at all — no disclosure.
    if (!job || job.customer_id !== customer.id) {
      throw new ApiError("JOB_NOT_FOUND", "No job was found with this ID.");
    }

    const body: JobV1 = {
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
      ...(job.quality ? { quality: job.quality } : {}),
      ...(job.error_code
        ? {
            error: {
              code: job.error_code as NonNullable<JobV1["error"]>["code"],
              message: job.error_message ?? "",
            },
          }
        : {}),
    };

    const res = NextResponse.json(body, { status: 200 });
    res.headers.set("X-Request-ID", requestId);
    return res;
  } catch (err) {
    if (err instanceof ApiError) return errorResponse(err, requestId);
    return internalErrorResponse(requestId, err);
  }
}
