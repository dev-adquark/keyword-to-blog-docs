import { describe, expect, it } from "vitest";

describe("next.config.js rewrites", () => {
  it("maps the bare /v1/generate path (used by the docs' curl examples) to the real app/api/v1/generate route", async () => {
    const nextConfig = require("../next.config.js");
    const rewrites = await nextConfig.rewrites();
    expect(rewrites).toContainEqual({
      source: "/v1/generate",
      destination: "/api/v1/generate",
    });
  });
});
