import { newRequestId } from "./ids";

export function resolveRequestId(headers: Headers): string {
  return headers.get("x-request-id")?.trim() || newRequestId();
}
