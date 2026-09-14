import { describe, it, expect } from "vitest";
import { validateWebhookUrl } from "@/lib/server/webhooks";

describe("validateWebhookUrl", () => {
  it("allows public HTTPS destinations", async () => {
    await expect(validateWebhookUrl("https://example.com/webhooks")).resolves.toBe(true);
  });

  it("rejects loopback and internal destination targets", async () => {
    await expect(validateWebhookUrl("http://localhost:3000/hook")).resolves.toBe(false);
    await expect(validateWebhookUrl("http://127.0.0.1/hook")).resolves.toBe(false);
    await expect(validateWebhookUrl("http://0.0.0.0:8080/hook")).resolves.toBe(false);
    await expect(validateWebhookUrl("http://10.0.0.5/hook")).resolves.toBe(false);
    await expect(validateWebhookUrl("https://[::1]/hook")).resolves.toBe(false);
  });

  it("rejects non-HTTP schemes and metadata endpoints", async () => {
    await expect(validateWebhookUrl("ftp://example.com")).resolves.toBe(false);
    await expect(validateWebhookUrl("http://169.254.169.254/latest/meta-data")).resolves.toBe(false);
  });
});
