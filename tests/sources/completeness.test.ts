import { describe, expect, it } from "vitest";
import { evaluateCompleteness } from "@/lib/server/sources/completeness";
import { normalizedSource } from "./fixtures";

const SUBSTANTIAL_DESCRIPTION =
  "Company X today announced a major expansion of its flagship product line, adding a dozen new capabilities that customers have requested for over a year. The rollout begins this week in North America and Europe, with additional regions following on a staggered schedule through the end of the quarter. Executives said the changes reflect months of user research and direct feedback from the company's largest enterprise customers, several of whom piloted the new features ahead of the public release. Analysts covering the sector described the update as one of the most significant since the product's original launch, noting that it directly addresses several long-standing complaints about performance and integration flexibility. Industry observers also pointed to the timing of the announcement, which comes just weeks after a chief competitor unveiled a similar set of upgrades, intensifying an already competitive race for enterprise customers evaluating both platforms this fiscal year. The company said pricing for existing subscribers would remain unchanged through the next renewal cycle.";

describe("evaluateCompleteness", () => {
  it("fails with zero approved sources", () => {
    expect(evaluateCompleteness([]).passed).toBe(false);
  });

  it("REGRESSION: PASSES with a single strong source that has substantial real evidence — a second provider is not mandatory", () => {
    const source = normalizedSource({ description: SUBSTANTIAL_DESCRIPTION });
    const result = evaluateCompleteness([source]);
    expect(result.passed).toBe(true);
  });

  it("FAILS with a single insufficient source (not enough real evidence to trust alone)", () => {
    expect(evaluateCompleteness([normalizedSource()]).passed).toBe(false);
  });

  it("FAILS with two weak sources whose combined evidence is still too little", () => {
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

  it("REGRESSION: PASSES with one strong source even when representing what's left after other providers failed", () => {
    // Simulates: 2 of 3 configured providers failed/timed out, and dedup
    // already collapsed 3 near-identical/syndicated candidates from the
    // one working provider down to a single genuine article — completeness
    // must still judge it on its own merits, not reject it as "too few".
    const survivingSource = normalizedSource({ description: SUBSTANTIAL_DESCRIPTION, provider: "newsdata" });
    expect(evaluateCompleteness([survivingSource]).passed).toBe(true);
  });

  it("does not count provider metadata (publisher/category/language) as evidence", () => {
    const source = normalizedSource({
      description: null,
      content: null,
      publisher: "A Very Long Publisher Name That Describes Itself In Great Detail For No Real Reason At All",
      category: "business and finance and economics and markets and trading",
    });
    expect(evaluateCompleteness([source]).passed).toBe(false);
  });
});
