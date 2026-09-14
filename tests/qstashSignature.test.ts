import { describe, it, expect } from "vitest";
import { verifyQstashSignature } from "@/lib/server/qstash";

describe("verifyQstashSignature", () => {
  it("rejects a missing signature", async () => {
    await expect(verifyQstashSignature(null, JSON.stringify({ jobId: "job_1" }))).resolves.toBe(
      false
    );
  });

  it("rejects a garbage/invalid signature rather than throwing", async () => {
    await expect(
      verifyQstashSignature("not-a-real-jwt", JSON.stringify({ jobId: "job_1" }))
    ).resolves.toBe(false);
  });
});
