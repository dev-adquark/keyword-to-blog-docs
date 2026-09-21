import { NextResponse } from "next/server";
import type { ErrorCode, ErrorResponseV1 } from "@/lib/types";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  AUTH_MISSING: 401,
  AUTH_INVALID: 401,
  SCOPE_INSUFFICIENT: 403,
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  PROHIBITED_INPUT: 422,
  JOB_NOT_FOUND: 404,
  JOB_FAILED: 200, // job resource itself is returned with 200; error lives in job.error
  CONTENT_QUALITY_FAILED: 422,
  SOURCE_VALIDATION_FAILED: 422,
  INTERNAL_ERROR: 500,
};

/** The real HTTP status an error will be answered with — use this instead of
 * guessing, e.g. when recording a status code for usage/analytics purposes. */
export function statusForError(err: unknown): number {
  return err instanceof ApiError ? STATUS_BY_CODE[err.code] : 500;
}

export class ApiError extends Error {
  code: ErrorCode;
  details?: Record<string, unknown>;
  extraHeaders?: Record<string, string>;

  constructor(
    code: ErrorCode,
    message: string,
    details?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.extraHeaders = extraHeaders;
  }
}

export function errorResponse(
  err: ApiError,
  requestId: string
): NextResponse<ErrorResponseV1> {
  const body: ErrorResponseV1 = {
    error: {
      code: err.code,
      message: err.message,
      requestId,
      ...(err.details ? { details: err.details } : {}),
    },
  };
  const res = NextResponse.json(body, { status: STATUS_BY_CODE[err.code] });
  res.headers.set("X-Request-ID", requestId);
  if (err.extraHeaders) {
    for (const [k, v] of Object.entries(err.extraHeaders)) res.headers.set(k, v);
  }
  return res;
}

/** Never leak stack traces / provider errors to clients — log server-side, return a generic 500. */
export function internalErrorResponse(
  requestId: string,
  loggedError: unknown
): NextResponse<ErrorResponseV1> {
  console.error(
    JSON.stringify({
      requestId,
      level: "error",
      message: "unhandled_error",
      error: loggedError instanceof Error ? loggedError.message : String(loggedError),
    })
  );
  return errorResponse(
    new ApiError("INTERNAL_ERROR", "An internal error occurred. Please try again."),
    requestId
  );
}
