import { describe, expect, it } from "vitest";
import { readJsonBodyWithSizeLimit, MAX_REQUEST_BODY_BYTES } from "@/lib/server/requestBody";
import { ApiError } from "@/lib/server/apiErrors";

function requestWithBody(body: string, withContentLength = true) {
  const headers = new Headers({ "content-type": "application/json" });
  if (withContentLength) {
    headers.set("content-length", String(Buffer.byteLength(body, "utf8")));
  }
  return new Request("http://localhost/api/v1/generate", { method: "POST", headers, body });
}

describe("readJsonBodyWithSizeLimit", () => {
  it("parses a normal, small JSON body", async () => {
    const body = JSON.stringify({ keywords: ["a"] });
    await expect(readJsonBodyWithSizeLimit(requestWithBody(body))).resolves.toEqual({
      keywords: ["a"],
    });
  });

  it("rejects an oversized body via Content-Length before reading it", async () => {
    const body = "x".repeat(10);
    const req = requestWithBody(body);
    req.headers.set("content-length", String(MAX_REQUEST_BODY_BYTES + 1));
    await expect(readJsonBodyWithSizeLimit(req)).rejects.toThrow(ApiError);
  });

  it("rejects an oversized body even without a Content-Length header (measured after reading)", async () => {
    const oversized = "a".repeat(MAX_REQUEST_BODY_BYTES + 1);
    const req = requestWithBody(oversized, false);
    await expect(readJsonBodyWithSizeLimit(req)).rejects.toThrow(ApiError);
  });

  it("returns null for malformed JSON rather than throwing", async () => {
    await expect(readJsonBodyWithSizeLimit(requestWithBody("not json"))).resolves.toBeNull();
  });
});
