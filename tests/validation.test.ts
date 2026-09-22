import { describe, it, expect } from "vitest";
import { generateRequestSchema, loginSchema } from "@/lib/server/validation";

describe("generateRequestSchema", () => {
  const valid = {
    keywords: ["ai", "marketing"],
    language: "en",
    tone: "professional",
    constraints: { maxWords: 800 },
    format: { responseTypes: ["markdown"] },
  };

  it("accepts a minimal valid request", () => {
    expect(generateRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty keywords array", () => {
    const result = generateRequestSchema.safeParse({ ...valid, keywords: [] });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid tone", () => {
    const result = generateRequestSchema.safeParse({ ...valid, tone: "sarcastic" });
    expect(result.success).toBe(false);
  });

  it("rejects maxWords outside the allowed range", () => {
    const result = generateRequestSchema.safeParse({
      ...valid,
      constraints: { maxWords: 50 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects minWords greater than maxWords", () => {
    const result = generateRequestSchema.safeParse({
      ...valid,
      constraints: { maxWords: 500, minWords: 5000 },
    });
    expect(result.success).toBe(false);
  });

  it("accepts minWords equal to maxWords", () => {
    const result = generateRequestSchema.safeParse({
      ...valid,
      constraints: { maxWords: 500, minWords: 500 },
    });
    expect(result.success).toBe(true);
  });

  it("REGRESSION: accepts a request with maxWords omitted entirely — it is optional, not required", () => {
    const result = generateRequestSchema.safeParse({ ...valid, constraints: {} });
    expect(result.success).toBe(true);
  });

  it("REGRESSION: accepts minWords with no maxWords present (nothing to compare against)", () => {
    const result = generateRequestSchema.safeParse({ ...valid, constraints: { minWords: 500 } });
    expect(result.success).toBe(true);
  });

  it("accepts a request with no minWords at all", () => {
    expect(generateRequestSchema.safeParse(valid).success).toBe(true);
  });
});

describe("loginSchema", () => {
  it("requires an email and a non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
});
