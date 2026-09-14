import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/password", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
}));

vi.mock("@/lib/server/session", () => ({
  signSession: vi.fn(async () => "signed-token"),
  sessionCookieOptions: {},
  SESSION_COOKIE: "ktb_session",
}));

vi.mock("@/lib/server/env", () => ({
  env: { AUTH_SECRET: "test-secret" },
}));

const { POST } = await import("@/app/api/auth/login/route");
const { findUserByEmail } = await import("@/lib/server/repository");
const { verifyPassword } = await import("@/lib/server/password");

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the same generic error for a nonexistent email as for a wrong password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const resNoUser = await POST(loginRequest({ email: "nobody@example.com", password: "whatever123" }));
    const bodyNoUser = await resNoUser.json();

    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      password_hash: "hash",
      name: "Ada",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const resWrongPass = await POST(loginRequest({ email: "ada@example.com", password: "wrongpassword" }));
    const bodyWrongPass = await resWrongPass.json();

    expect(resNoUser.status).toBe(401);
    expect(resWrongPass.status).toBe(401);
    expect(bodyNoUser).toEqual(bodyWrongPass);
  });

  it("rejects a disabled account the same way as a wrong password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      password_hash: "hash",
      name: "Ada",
      status: "disabled",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    expect(res.status).toBe(401);
  });

  it("logs a valid user in and sets the session cookie", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue({
      id: "user_1",
      email: "ada@example.com",
      password_hash: "hash",
      name: "Ada",
      status: "active",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("ktb_session=signed-token");
  });

  it("rejects malformed request bodies without crashing", async () => {
    const res = await POST(loginRequest({ email: "not-an-email" }));
    expect(res.status).toBe(401);
  });
});
