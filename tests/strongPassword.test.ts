import { describe, expect, it } from "vitest";
import {
  generateStrongPassword,
  UPPER,
  LOWER,
  DIGITS,
  SPECIAL,
} from "../scripts/lib/strongPassword.mjs";

function hasCharFrom(password: string, pool: string): boolean {
  return [...password].some((c) => pool.includes(c));
}

describe("generateStrongPassword", () => {
  it("defaults to at least 20 characters", () => {
    expect(generateStrongPassword().length).toBeGreaterThanOrEqual(20);
  });

  it("rejects a length below the 20-character minimum", () => {
    expect(() => generateStrongPassword(10)).toThrow();
  });

  it("always contains at least one uppercase, lowercase, digit, and special character", () => {
    for (let i = 0; i < 50; i++) {
      const password = generateStrongPassword();
      expect(hasCharFrom(password, UPPER)).toBe(true);
      expect(hasCharFrom(password, LOWER)).toBe(true);
      expect(hasCharFrom(password, DIGITS)).toBe(true);
      expect(hasCharFrom(password, SPECIAL)).toBe(true);
    }
  });

  it("never contains whitespace or characters outside the defined pools", () => {
    const allowed = new Set([...UPPER, ...LOWER, ...DIGITS, ...SPECIAL]);
    const password = generateStrongPassword();
    for (const char of password) {
      expect(allowed.has(char)).toBe(true);
    }
  });

  it("generates a different password every time (no shared/predictable passwords)", () => {
    const passwords = new Set(Array.from({ length: 200 }, () => generateStrongPassword()));
    expect(passwords.size).toBe(200);
  });

  it("does not always place the four guaranteed-class characters in the first four positions", () => {
    // A naive "prefix then fill" generator without shuffling would put one of
    // each class in a fixed spot — confirm the guaranteed uppercase char
    // isn't always at index 0 across many samples (proves real shuffling).
    const firstCharIsUpper = Array.from({ length: 50 }, () => generateStrongPassword()).map((p) =>
      UPPER.includes(p[0])
    );
    expect(firstCharIsUpper.some((v) => v === false)).toBe(true);
  });
});
