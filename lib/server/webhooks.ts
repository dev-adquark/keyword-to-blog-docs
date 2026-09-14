import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";

export interface WebhookDeliveryResult {
  attempted: boolean;
  delivered: boolean;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "metadata.google.internal.",
]);

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 127) ||
    (a === 169 && b === 254) ||
    (a === 0 && b === 0 && parts[2] === 0 && parts[3] === 0)
  );
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80") ||
    normalized.startsWith("::ffff:")
  );
}

function isDangerousIp(ip: string): boolean {
  if (net.isIP(ip) === 4) return isPrivateIPv4(ip);
  if (net.isIP(ip) === 6) return isPrivateIPv6(ip);
  return false;
}

export async function validateWebhookUrl(rawUrl: string): Promise<boolean> {
  try {
    const url = new URL(rawUrl);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    if (url.username || url.password) return false;

    const hostname = url.hostname.toLowerCase();
    if (!hostname || hostname === "") return false;
    if (hostname.endsWith(".localhost") || BLOCKED_HOSTNAMES.has(hostname)) return false;

    if (hostname.includes(":")) {
      const ipv6 = hostname.replace(/\[|\]/g, "");
      if (net.isIP(ipv6) === 6) return !isDangerousIp(ipv6);
    }

    if (net.isIP(hostname) === 4 || net.isIP(hostname) === 6) {
      return !isDangerousIp(hostname);
    }

    const addresses = await dns.lookup(hostname, { all: true });
    return addresses.every(({ address }) => !isDangerousIp(address));
  } catch {
    return false;
  }
}

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export async function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): Promise<boolean> {
  if (!signature) return false;

  const match = /^t=(\d+),v1=([a-f0-9]+)$/i.exec(signature.trim());
  if (!match) return false;

  const [, timestamp, provided] = match;
  if (!timestamp || !provided) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Sends a signed webhook. Signature scheme: HMAC-SHA256 over `${timestamp}.${body}`,
 * using a per-job one-time secret so the receiver can verify authenticity and
 * a timestamp so replayed deliveries can be rejected (events older than 5 min).
 */
export async function deliverWebhook(params: {
  url: string;
  event: "job.succeeded" | "job.failed";
  secret: string;
  payload: unknown;
}): Promise<WebhookDeliveryResult> {
  if (!(await validateWebhookUrl(params.url))) {
    return { attempted: false, delivered: false };
  }

  const body = JSON.stringify({ event: params.event, data: params.payload });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac("sha256", params.secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  let lastResponse: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      lastResponse = await fetch(params.url, {
        method: "POST",
        redirect: "manual",
        headers: {
          "content-type": "application/json",
          "x-ktb-signature": `t=${timestamp},v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (lastResponse.ok) {
        return { attempted: true, delivered: true };
      }

      if (lastResponse.status !== 429 && lastResponse.status < 500) {
        return { attempted: true, delivered: false };
      }
    } catch {
      if (attempt === 2) {
        return { attempted: true, delivered: false };
      }
      continue;
    }

    if (attempt < 2) {
      const backoffMs = 250 * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  return { attempted: true, delivered: false };
}

export function generateWebhookSecret(): string {
  return randomBytes(24).toString("hex");
}
