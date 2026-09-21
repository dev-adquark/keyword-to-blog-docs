import { describe, expect, it } from "vitest";
import { evaluateRelevance } from "@/lib/server/sources/relevance";
import { normalizedSource } from "./fixtures";

describe("evaluateRelevance", () => {
  it("accepts a source that clearly matches the requested topic", () => {
    const source = normalizedSource({
      title: "Apple unveils iPhone 18 with major camera overhaul",
      description: "Apple today launched the iPhone 18, its flagship smartphone, at a special event.",
    });
    const result = evaluateRelevance(source, ["Apple iPhone 18"], "Apple iPhone 18 launch");
    expect(result.relevant).toBe(true);
  });

  it("rejects a generic article that only contains one incidental keyword match", () => {
    // Covers the general smartphone market, not the specific iPhone 18 launch.
    const source = normalizedSource({
      title: "Global smartphone market grows 4% as demand rebounds",
      description: "Samsung, Xiaomi, and other manufacturers reported stronger sales this quarter, alongside Apple.",
    });
    const result = evaluateRelevance(source, ["Apple iPhone 18"], "Apple iPhone 18 launch");
    expect(result.relevant).toBe(false);
  });

  it("rejects a source that doesn't mention the primary topic at all", () => {
    const source = normalizedSource({
      title: "Local weather forecast calls for rain this weekend",
      description: "Meteorologists expect scattered showers across the region.",
    });
    const result = evaluateRelevance(source, ["electric vehicle tax credit"], "electric vehicle tax credit changes");
    expect(result.relevant).toBe(false);
  });
});
