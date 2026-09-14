import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey, extractApiKeyFromHeaders } from "@/lib/server/apiKey";

describe("generateApiKey", () => {
  it("produces keys with the correct environment prefix", () => {
    const live = generateApiKey("live");
    const test = generateApiKey("test");
    expect(live.raw.startsWith("ktb_live_")).toBe(true);
    expect(test.raw.startsWith("ktb_test_")).toBe(true);
  });

  it("never generates the same raw key twice (CSPRNG, high entropy)", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      seen.add(generateApiKey("live").raw);
    }
    expect(seen.size).toBe(1000);
  });

  it("hash is deterministic and matches hashApiKey(raw)", () => {
    const key = generateApiKey("live");
    expect(key.hash).toBe(hashApiKey(key.raw));
  });

  it("the stored prefix never contains the full secret", () => {
    const key = generateApiKey("live");
    expect(key.prefix.length).toBeLessThan(key.raw.length);
    expect(key.raw.startsWith(key.prefix)).toBe(true);
  });
});

describe("extractApiKeyFromHeaders", () => {
  it("reads X-API-Key", () => {
    const headers = new Headers({ "x-api-key": "ktb_live_abc" });
    expect(extractApiKeyFromHeaders(headers)).toBe("ktb_live_abc");
  });

  it("reads Authorization: Bearer as a fallback", () => {
    const headers = new Headers({ authorization: "Bearer ktb_live_xyz" });
    expect(extractApiKeyFromHeaders(headers)).toBe("ktb_live_xyz");
  });

  it("returns null when neither header is present", () => {
    expect(extractApiKeyFromHeaders(new Headers())).toBeNull();
  });
});
