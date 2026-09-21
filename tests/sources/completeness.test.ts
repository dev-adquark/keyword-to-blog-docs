import { describe, expect, it } from "vitest";
import { evaluateCompleteness } from "@/lib/server/sources/completeness";
import { normalizedSource } from "./fixtures";

describe("evaluateCompleteness", () => {
  it("fails with only one approved source", () => {
    expect(evaluateCompleteness([normalizedSource()]).passed).toBe(false);
  });

  it("fails with two sources that have almost no real text", () => {
    const sources = [
      normalizedSource({ sourceId: "a", description: "Short.", content: null }),
      normalizedSource({ sourceId: "b", description: "Also short.", content: null }),
    ];
    expect(evaluateCompleteness(sources).passed).toBe(false);
  });

  it("passes with two sources that together have enough real evidence", () => {
    const sources = [normalizedSource({ sourceId: "a" }), normalizedSource({ sourceId: "b" })];
    expect(evaluateCompleteness(sources).passed).toBe(true);
  });
});
