import { describe, expect, it } from "vitest";
import {
  TEAM,
  hasResetPasswordsFlag,
  printResetCredentials,
  resetTeamPasswords,
} from "../scripts/provisionTeam.mjs";

function rosterRows() {
  return TEAM.map((member, index) => ({
    id: `usr_${index}`,
    email: member.email,
  }));
}

describe("provisionTeam password reset mode", () => {
  it("is enabled only by the explicit flag", () => {
    expect(hasResetPasswordsFlag([])).toBe(false);
    expect(hasResetPasswordsFlag(["--reset-passwords"])).toBe(true);
  });

  it("resets unique strong passwords for exactly the fixed roster and only updates password_hash", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const rows = [...rosterRows(), { id: "usr_outside", email: "outside@example.com" }];
    const rosterIds = new Set(rosterRows().map(({ id }) => id));
    const client = {
      async query(sql: string, params?: unknown[]) {
        calls.push({ sql, params });
        if (sql.startsWith("SELECT id, email")) return { rows };
        return { rows: [] };
      },
    };
    let sequence = 0;
    const passwords = await resetTeamPasswords(client, {
      passwordGenerator: () => `Aa1!password-reset-${++sequence}`,
      hashPassword: async (password) => `bcrypt:${password}`,
    });

    expect(passwords).toHaveLength(TEAM.length);
    expect(new Set(passwords.map(({ password }) => password)).size).toBe(TEAM.length);
    for (const { email, role, password } of passwords) {
      expect(TEAM).toContainEqual({ email, role });
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
      expect(password.length).toBeGreaterThanOrEqual(20);
    }

    const select = calls.find(({ sql }) => sql.startsWith("SELECT id, email"));
    expect(select?.params?.[0]).toEqual(TEAM.map(({ email }) => email));

    const updates = calls.filter(({ sql }) => sql.startsWith("UPDATE users"));
    expect(updates).toHaveLength(TEAM.length);
    for (const update of updates) {
      expect(update.sql).toBe("UPDATE users SET password_hash = $2 WHERE id = $1");
      expect(rosterIds).toContain(update.params?.[0]);
      expect(update.params?.[0]).not.toBe("usr_outside");
      expect(String(update.params?.[1])).toMatch(/^bcrypt:/);
    }
    expect(calls.map(({ sql }) => sql)).toContain("BEGIN");
    expect(calls.map(({ sql }) => sql)).toContain("COMMIT");
  });

  it("does not reset anyone when a fixed roster member is missing", async () => {
    const calls: string[] = [];
    const client = {
      async query(sql: string) {
        calls.push(sql);
        if (sql.startsWith("SELECT id, email")) return { rows: rosterRows().slice(0, -1) };
        return { rows: [] };
      },
    };

    await expect(resetTeamPasswords(client)).rejects.toThrow("missing roster users");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("email = ANY");
  });

  it("prints each reset password exactly once alongside its email and role", () => {
    const output: string[] = [];
    const credentials = [
      { email: TEAM[0].email, role: TEAM[0].role, password: "Aa1!this-is-a-test-password" },
    ];

    printResetCredentials(credentials, (line) => output.push(line));
    const text = output.join("\n");
    expect(text.match(/Aa1!this-is-a-test-password/g)).toHaveLength(1);
    expect(text).toContain(`${TEAM[0].email}  (${TEAM[0].role})`);
  });
});
