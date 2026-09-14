import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "@/lib/server/webhooks";

const SECRET = "test_webhook_secret";

function sign(timestamp: number, body: string, secret = SECRET): string {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

describe("verifyWebhookSignature", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("accepts a freshly signed payload", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ event: "job.succeeded" });
    await expect(verifyWebhookSignature(body, sign(now, body), SECRET)).resolves.toBe(true);
  });

  it("rejects a missing signature header", async () => {
    await expect(verifyWebhookSignature("{}", null, SECRET)).resolves.toBe(false);
  });

  it("rejects a malformed signature header", async () => {
    await expect(verifyWebhookSignature("{}", "not-a-signature", SECRET)).resolves.toBe(false);
  });

  it("rejects a tampered body", async () => {
    const now = Math.floor(Date.now() / 1000);
    const signature = sign(now, JSON.stringify({ event: "job.succeeded" }));
    await expect(
      verifyWebhookSignature(JSON.stringify({ event: "job.failed" }), signature, SECRET)
    ).resolves.toBe(false);
  });

  it("rejects a signature produced with the wrong secret", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ event: "job.succeeded" });
    await expect(
      verifyWebhookSignature(body, sign(now, body, "wrong_secret"), SECRET)
    ).resolves.toBe(false);
  });

  it("rejects a stale (replayed) signature older than 5 minutes", async () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 6 * 60;
    const body = JSON.stringify({ event: "job.succeeded" });
    await expect(verifyWebhookSignature(body, sign(staleTimestamp, body), SECRET)).resolves.toBe(
      false
    );
  });
});
