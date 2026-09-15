import { describe, expect, it } from "vitest";
import {
  generateSessionToken,
  hashSessionToken,
  sessionExpiryDate,
  sessionCookieOptions,
  SESSION_COOKIE,
} from "@/lib/server/session";

describe("session tokens", () => {
  it("generates unpredictable, unique opaque tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateSessionToken()));
    expect(tokens.size).toBe(100);
  });

  it("hashes deterministically (so lookups by hash work) but never returns the raw token", () => {
    const token = generateSessionToken();
    const hash1 = hashSessionToken(token);
    const hash2 = hashSessionToken(token);
    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(token);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("different tokens hash to different values", () => {
    const a = hashSessionToken(generateSessionToken());
    const b = hashSessionToken(generateSessionToken());
    expect(a).not.toBe(b);
  });
});

describe("session cookie configuration", () => {
  it("is httpOnly and has no persistent Max-Age/expires — a true browser-session cookie", () => {
    expect(sessionCookieOptions.httpOnly).toBe(true);
    expect(sessionCookieOptions).not.toHaveProperty("maxAge");
    expect(sessionCookieOptions).not.toHaveProperty("expires");
    expect(sessionCookieOptions.path).toBe("/");
  });

  it("uses a stable, recognizable cookie name", () => {
    expect(SESSION_COOKIE).toBe("ktb_session");
  });
});

describe("sessionExpiryDate", () => {
  it("returns an absolute server-side backstop roughly 14 days out", () => {
    const now = Date.now();
    const expiry = sessionExpiryDate().getTime();
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(expiry - now).toBeGreaterThan(fourteenDaysMs - 5000);
    expect(expiry - now).toBeLessThanOrEqual(fourteenDaysMs + 5000);
  });
});
