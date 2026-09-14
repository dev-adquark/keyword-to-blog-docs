import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/password", () => ({
  hashPassword: vi.fn(async () => "hashed"),
  passwordMeetsPolicy: vi.fn(() => true),
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  createUserAndCustomer: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  signSession: vi.fn(async () => "signed-token"),
  sessionCookieOptions: {},
  SESSION_COOKIE: "ktb_session",
}));

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret" },
}));

const { POST } = await import("@/app/api/auth/signup/route");
const { findUserByEmail, createUserAndCustomer } = await import("@/lib/server/repository");

describe("signup route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a safe JSON error when signup fails unexpectedly", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    vi.mocked(createUserAndCustomer).mockRejectedValue(new Error("db down"));

    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ada Lovelace",
          email: "ada@example.com",
          password: "longenoughpassword",
        }),
      })
    );

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("INTERNAL_ERROR");
    expect(body.message).toBe("We couldn't create your account. Please try again.");
  });

  it("returns the duplicate-email validation message without crashing", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      password_hash: "x",
      name: "Ada",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await POST(
      new Request("http://localhost/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Ada Lovelace",
          email: "ada@example.com",
          password: "longenoughpassword",
        }),
      })
    );

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.message).toBe("An account with this email already exists.");
  });
});
