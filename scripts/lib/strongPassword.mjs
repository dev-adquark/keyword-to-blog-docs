// Cryptographically secure password generation, shared by provisionTeam.mjs
// and its test suite. Plain .mjs (not .ts) so it can be imported directly by
// a standalone Node script with no build step, exactly like scripts/migrate.mjs.
import { randomInt } from "node:crypto";

export const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no ambiguous I/O
export const LOWER = "abcdefghijkmnopqrstuvwxyz";
export const DIGITS = "23456789";
export const SPECIAL = "!@#$%^&*-_=+?";
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

/**
 * Crypto-random (node:crypto randomInt, never Math.random), at least
 * `length` characters, guaranteeing at least one of each character class,
 * then shuffled with a CSPRNG so the guaranteed characters aren't always in
 * the first few positions.
 */
export function generateStrongPassword(length = 24) {
  if (length < 20) {
    throw new Error("Password length must be at least 20 characters.");
  }
  const chars = [UPPER, LOWER, DIGITS, SPECIAL].map((pool) => pool[randomInt(pool.length)]);
  while (chars.length < length) chars.push(ALL[randomInt(ALL.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
