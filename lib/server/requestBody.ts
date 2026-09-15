import "server-only";
import { ApiError } from "./apiErrors";

/** Generation requests are small structured JSON (no uploads) — 256KB is generous headroom. */
export const MAX_REQUEST_BODY_BYTES = 256 * 1024;

/**
 * Reads and JSON-parses a request body with an explicit size cap, so an
 * oversized payload is rejected deterministically instead of being parsed
 * (and, downstream, sent to the AI provider) regardless of size.
 */
export async function readJsonBodyWithSizeLimit(req: Request): Promise<unknown> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "Request body is too large.");
  }

  const text = await req.text().catch(() => null);
  if (text === null) return null;
  if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BODY_BYTES) {
    throw new ApiError("VALIDATION_ERROR", "Request body is too large.");
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
