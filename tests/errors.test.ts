import { describe, it, expect } from "vitest";
import { ApiError, errorResponse } from "@/lib/server/apiErrors";

describe("errorResponse", () => {
  it.each([
    ["AUTH_MISSING", 401],
    ["AUTH_INVALID", 401],
    ["SCOPE_INSUFFICIENT", 403],
    ["RATE_LIMITED", 429],
    ["QUOTA_EXCEEDED", 429],
    ["VALIDATION_ERROR", 400],
    ["PROHIBITED_INPUT", 422],
    ["JOB_NOT_FOUND", 404],
    ["CONTENT_QUALITY_FAILED", 422],
    ["INTERNAL_ERROR", 500],
  ] as const)("maps %s to HTTP %i", (code, status) => {
    const res = errorResponse(new ApiError(code, "message"), "req_test");
    expect(res.status).toBe(status);
  });

  it("includes the request ID in the body and header", async () => {
    const res = errorResponse(new ApiError("AUTH_INVALID", "nope"), "req_abc123");
    const body = await res.json();
    expect(body.error.requestId).toBe("req_abc123");
    expect(res.headers.get("X-Request-ID")).toBe("req_abc123");
  });

  it("never leaks internal details beyond what was explicitly attached", async () => {
    const res = errorResponse(new ApiError("VALIDATION_ERROR", "bad input"), "req_1");
    const body = await res.json();
    expect(body.error.details).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/stack|Error:/);
  });
});
