import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/password", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("@/lib/server/repository", async () => {
  const actual = await vi.importActual<typeof import("@/lib/server/repository")>(
    "@/lib/server/repository"
  );
  return {
    TEAM_ROLES: actual.TEAM_ROLES,
    isValidTeamRole: actual.isValidTeamRole,
    findUserByEmail: vi.fn(),
    createSession: vi.fn(async () => ({ id: "sess_1" })),
    touchUserLastLogin: vi.fn(async () => undefined),
    recordAuditEvent: vi.fn(async () => undefined),
  };
});

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
const { findUserByEmail, createSession, touchUserLastLogin, recordAuditEvent } =
  await import("@/lib/server/repository");
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
    role: "DEVELOPER" as const,
    last_login_at: null,
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

  it("rejects an account with no password hash set, without calling verifyPassword", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(activeUser({ password_hash: null }));
    const res = await POST(loginRequest({ email: "ada@example.com", password: "whatever123" }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ code: "AUTH_INVALID", message: "Invalid email or password." });
    expect(verifyPassword).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });

  it("rejects a disabled account the same way as a wrong password", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(activeUser({ status: "disabled" }));
    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    expect(res.status).toBe(401);
  });

  it("rejects an account with no recognized team role, without calling verifyPassword", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(
      activeUser({ role: "SOMETHING_INVALID" as never })
    );
    const res = await POST(loginRequest({ email: "ada@example.com", password: "correcthorsebattery" }));
    expect(res.status).toBe(401);
    expect(verifyPassword).not.toHaveBeenCalled();
  });

  it("logs a valid user in, creates a real session, sets a session cookie with no Max-Age, updates last_login_at, and audit-logs success", async () => {
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

    expect(touchUserLastLogin).toHaveBeenCalledWith("user_1");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "login_success", targetUserId: "user_1" })
    );
  });

  it("audit-logs a failed login attempt", async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(activeUser());
    vi.mocked(verifyPassword).mockResolvedValue(false);

    await POST(loginRequest({ email: "ada@example.com", password: "wrongpassword" }));
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "login_failed", targetUserId: "user_1" })
    );
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
