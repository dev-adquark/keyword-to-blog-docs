#!/usr/bin/env node
// Provisions the fixed internal team roster against DATABASE_URL.
//
// This is the ONLY way accounts are created — there is no public signup.
// Safe to re-run: existing users are left with their current password and
// status; only their role/name are kept in sync with the roster below. A
// brand-new user gets a fresh cryptographically random password, printed to
// this terminal EXACTLY ONCE for the administrator to distribute securely —
// it is never stored in plaintext anywhere (only its bcrypt hash is saved),
// never logged again after this run, and this script has no way to recover
// it afterward.
//
// Usage:
//   node scripts/provisionTeam.mjs
//   node scripts/provisionTeam.mjs --reset-passwords

import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";
import bcrypt from "bcryptjs";
import { generateStrongPassword } from "./lib/strongPassword.mjs";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const SALT_ROUNDS = 12; // matches lib/server/password.ts
const DEFAULT_PLAN_ID = "starter"; // matches lib/plans.ts — 3 requests/day per API key

export const TEAM = [
  { email: "manpreet@adquark.io", role: "DEVELOPER" },
  { email: "sandeep@adquark.io", role: "DIGITAL_MARKETING" },
  { email: "pranav@adquark.io", role: "DIGITAL_MARKETING" },
  { email: "hardik@adquark.io", role: "ACCOUNT_MANAGEMENT" },
  { email: "piyush@adquark.io", role: "OWNER" },
  { email: "swapnil@adquark.io", role: "DIGITAL_MARKETING" },
  { email: "geet@adquark.io", role: "OWNER" },
];

function displayNameFromEmail(email) {
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function id(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function assertStrongPassword(password) {
  if (
    password.length < 20 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error("Password generator did not produce a strong password.");
  }
}

export function hasResetPasswordsFlag(argv = process.argv.slice(2)) {
  return argv.includes("--reset-passwords");
}

/** Resets passwords only for the fixed TEAM roster. */
export async function resetTeamPasswords(
  client,
  { passwordGenerator = generateStrongPassword, hashPassword = bcrypt.hash } = {}
) {
  const rosterEmails = TEAM.map(({ email }) => email.toLowerCase());
  const existing = await client.query(
    "SELECT id, email FROM users WHERE email = ANY($1::text[])",
    [rosterEmails]
  );
  const userIdByEmail = new Map(
    existing.rows.map((row) => [row.email.toLowerCase(), row.id])
  );
  const missing = rosterEmails.filter((email) => !userIdByEmail.has(email));
  if (missing.length > 0) {
    throw new Error(`Cannot reset passwords: missing roster users: ${missing.join(", ")}`);
  }

  const credentials = [];
  const passwords = new Set();
  for (const member of TEAM) {
    let password;
    do {
      password = passwordGenerator();
      assertStrongPassword(password);
    } while (passwords.has(password));
    passwords.add(password);
    credentials.push({
      email: member.email.toLowerCase(),
      role: member.role,
      password,
      userId: userIdByEmail.get(member.email.toLowerCase()),
    });
  }

  await client.query("BEGIN");
  try {
    for (const credential of credentials) {
      const passwordHash = await hashPassword(credential.password, SALT_ROUNDS);
      // Deliberately update only password_hash; all other user data is untouched.
      await client.query("UPDATE users SET password_hash = $2 WHERE id = $1", [
        credential.userId,
        passwordHash,
      ]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }

  return credentials.map(({ userId, ...credential }) => credential);
}

export function printResetCredentials(credentials, output = console.log) {
  output("\n=== RESET ACCOUNT PASSWORDS — shown once, distribute securely, then close this terminal ===\n");
  for (const credential of credentials) {
    output(`  ${credential.email}  (${credential.role})\n    ${credential.password}\n`);
  }
  output("These are NOT stored anywhere in plaintext and cannot be recovered after this.\n");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  const client = new pg.Client({
    connectionString,
    ssl: connectionString.includes("sslmode=disable") ? false : { rejectUnauthorized: true },
  });
  await client.connect();

  if (hasResetPasswordsFlag()) {
    try {
      const credentials = await resetTeamPasswords(client);
      console.log("\nPassword reset complete for the fixed internal team roster.");
      printResetCredentials(credentials);
    } finally {
      await client.end();
    }
    return;
  }

  const generatedCredentials = [];
  const results = [];

  try {
    for (const member of TEAM) {
      const email = member.email.toLowerCase();
      const name = displayNameFromEmail(email);

      const existing = await client.query(
        "SELECT id, role, status FROM users WHERE email = $1",
        [email]
      );

      if (existing.rows.length === 0) {
        const password = generateStrongPassword();
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
        const userId = id("usr");
        const customerId = id("cus");

        await client.query("BEGIN");
        try {
          await client.query(
            `INSERT INTO users (id, email, password_hash, name, role, status)
             VALUES ($1, $2, $3, $4, $5, 'active')`,
            [userId, email, passwordHash, name, member.role]
          );
          await client.query(
            `INSERT INTO customers (id, user_id, plan) VALUES ($1, $2, $3)`,
            [customerId, userId, DEFAULT_PLAN_ID]
          );
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }

        generatedCredentials.push({ email, password });
        results.push({ email, role: member.role, action: "CREATED" });
      } else {
        const row = existing.rows[0];
        await client.query(
          `UPDATE users SET role = $2, name = $3, updated_at = now() WHERE id = $1`,
          [row.id, member.role, name]
        );
        // Backfill a customer row for any pre-existing user who somehow
        // doesn't have one yet — never touches password_hash or status.
        await client.query(
          `INSERT INTO customers (id, user_id, plan)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO NOTHING`,
          [id("cus"), row.id, DEFAULT_PLAN_ID]
        );
        results.push({
          email,
          role: member.role,
          action: row.role === member.role ? "UNCHANGED" : "ROLE UPDATED",
        });
      }
    }
  } finally {
    await client.end();
  }

  console.log("\nProvisioning complete:\n");
  for (const r of results) {
    console.log(`  ${r.action.padEnd(14)} ${r.email}  (${r.role})`);
  }

  if (generatedCredentials.length > 0) {
    console.log(
      "\n=== NEW ACCOUNT PASSWORDS — shown once, distribute securely, then close this terminal ===\n"
    );
    for (const c of generatedCredentials) {
      console.log(`  ${c.email}\n    ${c.password}\n`);
    }
    console.log(
      "These are NOT stored anywhere in plaintext and cannot be recovered after this. " +
        "If lost, use the forgot-password flow instead of re-running this script.\n"
    );
  } else {
    console.log("\nNo new accounts were created — every roster email already existed.\n");
  }
}

const isDirectExecution =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Provisioning failed:", err.message);
    process.exit(1);
  });
}
