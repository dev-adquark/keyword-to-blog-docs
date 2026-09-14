import "server-only";
import { randomBytes, createHash } from "node:crypto";

export type ApiKeyEnvironment = "live" | "test";

export interface GeneratedApiKey {
  /** Full secret — shown to the user exactly once, never persisted. */
  raw: string;
  /** Safe-to-store, safe-to-display identifier, e.g. ktb_live_ab12cd34. */
  prefix: string;
  /** SHA-256 hex digest of `raw` — this is what's stored and matched on lookup. */
  hash: string;
  environment: ApiKeyEnvironment;
}

/**
 * Generates a new API key. Uses crypto.randomBytes (CSPRNG) — never Math.random().
 * Format: ktb_<env>_<43 url-safe base64 chars ~ 256 bits of entropy>
 */
export function generateApiKey(environment: ApiKeyEnvironment): GeneratedApiKey {
  const secretBytes = randomBytes(32);
  const secret = secretBytes.toString("base64url");
  const raw = `ktb_${environment}_${secret}`;
  const prefix = raw.slice(0, `ktb_${environment}_`.length + 8);
  const hash = hashApiKey(raw);
  return { raw, prefix, hash, environment };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Extracts the API key from either supported auth header, normalized to one string. */
export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const direct = headers.get("x-api-key");
  if (direct) return direct.trim();

  const authHeader = headers.get("authorization");
  if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}
