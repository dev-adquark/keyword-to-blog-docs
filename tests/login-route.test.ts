import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/password", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  findUserByEmail: vi.fn(),
  createSession: vi.fn(async () => ({ id: "sess_1" })),
}));

vi.mock("@/lib/server/session", () => ({
  SESSION_COOKIE: "ktb_session",
  sessionCookieOptions: { httpOnly: true, path: "/" },
  generateSessionToken: vi.fn(() => "raw-session-token"),
  hashSessionToken: vi.fn(() => "hashed-session-token"),
  sessionExpiryDate: vi.fn(() => new Date(Date.now() + 1000 * 60 * 60 * 24 * 14)),
}));

vi.mock("@/lib/server/rateLimit", () => ({
  consumeFixedWindowLimit: vi.fn(async () => ({ allowed: true, remaining: 9 })),
}));

vi.mock("@/lib/server/notifications", () => ({
  notifyOwner: vi.fn(async () => undefined),
  recordRepeatedViolation: vi.fn(async () => ({ shouldNotify: false, approxCount: 0, windowMinutes: 15 })),
  safeAfter: vi.fn((fn: () => Promise<void>) => fn()),
}));

const { POST } = await import("@/app/api/auth/login/route");
const { findUserByEmail, createSession } = await import("@/lib/server/repository");
const { verifyPassword } = await import("@/lib/server/password");
const { consumeFixedWindowLimit } = await import("@/lib/server/rateLimit");

function loginRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function activeUser(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "user_1",
    email: "ada@example.com",
    password_hash: "hash",
    name: "Ada",
    status: "active",
    email_verified_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("login route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consumeFixedWindowLimit).mockResolvedValue({ allowed: true, remaining: 9 });
  });

  it("returns the same generic error for a nonexistent email as for a wrong password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null);
    const resNoUser = await POST(loginRequest({ email: "nobody@example.com", password: "whatever123" }));
    const bodyNoUser = await resNoUser.json();

    vi.mocked(findUserByEmail).mockResolvedValue(activeUser());
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const resWrongPass = await POST(loginRequest({ email: "ada@example.com", password: "wrongpassword" }));
    const bodyWrongPass = await resWrongPass.json();

    expect(resNoUser.status).toBe(401);
    expect(resWrongPass.status).toBe(401);
    expect(bodyNoUser).toEqual(bodyWrongPass);
  });

  it("rejects a disabled account the same way as a wrong password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(activeUser({ status: "disabled" }));
    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    expect(res.status).toBe(401);
  });

  it("blocks a correct password with EMAIL_NOT_VERIFIED when the account is unverified — no session created", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(activeUser({ email_verified_at: null }));
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.code).toBe("EMAIL_NOT_VERIFIED");
    expect(createSession).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("logs a verified user in, creates a real session, and sets a session cookie with no Max-Age", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(activeUser());
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    expect(res.status).toBe(200);
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user_1", tokenHash: "hashed-session-token" })
    );
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("ktb_session=raw-session-token");
    // A true browser-session cookie: no Max-Age/Expires attribute at all.
    expect(setCookie?.toLowerCase()).not.toContain("max-age");
    expect(setCookie?.toLowerCase()).not.toContain("expires");
  });

  it("rejects malformed request bodies without crashing", async () => {
    const res = await POST(loginRequest({ email: "not-an-email" }));
    expect(res.status).toBe(401);
  });

  it("is rate limited per IP once the fixed-window limit is exceeded", async () => {
    vi.mocked(consumeFixedWindowLimit).mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(loginRequest({ email: "ada@example.com", password: "whatever123" }));
    expect(res.status).toBe(429);
  });
});
