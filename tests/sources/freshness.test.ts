import { describe, expect, it } from "vitest";
import { isWithinFreshnessPolicy } from "@/lib/server/sources/freshness";
import { normalizedSource } from "./fixtures";

const NOW = new Date("2026-09-21T15:00:00.000Z");

describe("isWithinFreshnessPolicy", () => {
  describe("TODAY_ONLY", () => {
    it("accepts a source published earlier today", () => {
      const source = normalizedSource({ publishedAt: "2026-09-21T02:00:00.000Z" });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(true);
    });

    it("rejects yesterday's article", () => {
      const source = normalizedSource({ publishedAt: "2026-09-20T23:59:00.000Z" });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(false);
    });

    it("rejects an older article", () => {
      const source = normalizedSource({ publishedAt: "2020-01-01T00:00:00.000Z" });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(false);
    });

    it("rejects a missing publishedAt — never guesses", () => {
      const source = normalizedSource({ publishedAt: null });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(false);
    });

    it("rejects an unparseable publishedAt", () => {
      const source = normalizedSource({ publishedAt: "not-a-real-date" });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(false);
    });

    it("rejects a future-dated article beyond clock-skew tolerance", () => {
      const source = normalizedSource({ publishedAt: "2026-09-22T00:00:00.000Z" });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(false);
    });

    it("tolerates a tiny future skew (a few minutes) from clock differences", () => {
      const source = normalizedSource({ publishedAt: "2026-09-21T15:02:00.000Z" });
      expect(isWithinFreshnessPolicy(source, "TODAY_ONLY", NOW)).toBe(true);
    });
  });

  describe("other policies", () => {
    it("LAST_24_HOURS accepts a source from 20 hours ago and rejects one from 30 hours ago", () => {
      const recent = normalizedSource({ publishedAt: new Date(NOW.getTime() - 20 * 3600_000).toISOString() });
      const old = normalizedSource({ publishedAt: new Date(NOW.getTime() - 30 * 3600_000).toISOString() });
      expect(isWithinFreshnessPolicy(recent, "LAST_24_HOURS", NOW)).toBe(true);
      expect(isWithinFreshnessPolicy(old, "LAST_24_HOURS", NOW)).toBe(false);
    });

    it("NO_FRESHNESS_REQUIREMENT accepts anything, even with no publishedAt", () => {
      const source = normalizedSource({ publishedAt: null });
      expect(isWithinFreshnessPolicy(source, "NO_FRESHNESS_REQUIREMENT", NOW)).toBe(true);
    });
  });
});
