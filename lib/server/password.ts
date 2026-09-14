import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Minimum password policy, enforced server-side regardless of client validation. */
export function passwordMeetsPolicy(plain: string): boolean {
  return typeof plain === "string" && plain.length >= 10;
}
