import { describe, expect, it } from "vitest";
import { evaluateSourceQuality } from "@/lib/server/sources/quality";
import { normalizedSource } from "./fixtures";

describe("evaluateSourceQuality", () => {
  it("passes a well-formed source", () => {
    expect(evaluateSourceQuality(normalizedSource()).passed).toBe(true);
  });

  it("rejects an invalid URL", () => {
    expect(evaluateSourceQuality(normalizedSource({ url: "not a url" })).passed).toBe(false);
  });

  it("rejects a non-HTTP(S) URL", () => {
    expect(evaluateSourceQuality(normalizedSource({ url: "ftp://example.com/file" })).passed).toBe(false);
  });

  it("rejects an empty/too-short title", () => {
    expect(evaluateSourceQuality(normalizedSource({ title: "Hi" })).passed).toBe(false);
  });

  it("rejects a source with no description and no content", () => {
    expect(evaluateSourceQuality(normalizedSource({ description: null, content: null })).passed).toBe(false);
  });

  it("rejects an obviously clickbait/spam title", () => {
    expect(evaluateSourceQuality(normalizedSource({ title: "Click here now, you won't believe this!" })).passed).toBe(
      false
    );
  });
});
