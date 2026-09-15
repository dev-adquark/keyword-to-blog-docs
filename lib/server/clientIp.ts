/** Best-effort client IP for coarse abuse rate limiting — Vercel sets x-forwarded-for. */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return headers.get("x-real-ip")?.trim() || "unknown";
}
