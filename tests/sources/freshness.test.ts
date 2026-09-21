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

  describe("LAST_7_DAYS boundary", () => {
    it("accepts content from 3 days ago, not just today — this was being incorrectly rejected under a today-only policy", () => {
      const source = normalizedSource({ publishedAt: new Date(NOW.getTime() - 3 * 24 * 3600_000).toISOString() });
      expect(isWithinFreshnessPolicy(source, "LAST_7_DAYS", NOW)).toBe(true);
    });

    it("accepts content from exactly 7 days ago (inclusive boundary)", () => {
      const source = normalizedSource({ publishedAt: new Date(NOW.getTime() - 7 * 24 * 3600_000).toISOString() });
      expect(isWithinFreshnessPolicy(source, "LAST_7_DAYS", NOW)).toBe(true);
    });

    it("rejects content just past the 7-day boundary", () => {
      const source = normalizedSource({ publishedAt: new Date(NOW.getTime() - 7 * 24 * 3600_000 - 60_000).toISOString() });
      expect(isWithinFreshnessPolicy(source, "LAST_7_DAYS", NOW)).toBe(false);
    });

    it("rejects content from 10 days ago", () => {
      const source = normalizedSource({ publishedAt: new Date(NOW.getTime() - 10 * 24 * 3600_000).toISOString() });
      expect(isWithinFreshnessPolicy(source, "LAST_7_DAYS", NOW)).toBe(false);
    });

    it("still rejects a missing or unparseable date under the 7-day policy — only the window widened, not the date requirement", () => {
      expect(isWithinFreshnessPolicy(normalizedSource({ publishedAt: null }), "LAST_7_DAYS", NOW)).toBe(false);
      expect(isWithinFreshnessPolicy(normalizedSource({ publishedAt: "garbage" }), "LAST_7_DAYS", NOW)).toBe(false);
    });

    it("still rejects a future-dated article under the 7-day policy", () => {
      const source = normalizedSource({ publishedAt: new Date(NOW.getTime() + 24 * 3600_000).toISOString() });
      expect(isWithinFreshnessPolicy(source, "LAST_7_DAYS", NOW)).toBe(false);
    });
  });
});
