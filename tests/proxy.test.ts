import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/server/repository", () => ({
  findActiveSessionByTokenHash: vi.fn(),
}));

const { proxy } = await import("@/proxy");
const { findActiveSessionByTokenHash } = await import("@/lib/server/repository");

function requestWithCookie(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `ktb_session=${cookie}`);
  return new NextRequest(`http://localhost${path}`, { headers });
}

describe("proxy (session gate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects an unauthenticated request away from /dashboard to /login", async () => {
    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue(null);
    const res = await proxy(requestWithCookie("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets an authenticated request through to /dashboard", async () => {
    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue({
      id: "sess_1",
      user_id: "user_1",
      session_token_hash: "hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    });
    const res = await proxy(requestWithCookie("/dashboard", "some-valid-token"));
    expect(res.status).toBe(200); // NextResponse.next()
  });

  it("redirects a request with a revoked/expired session token away from /dashboard", async () => {
    // findActiveSessionByTokenHash itself already filters out revoked/expired
    // rows — simulate that here by returning null for a stale token.
    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue(null);
    const res = await proxy(requestWithCookie("/dashboard", "revoked-token"));
    expect(res.status).toBe(307);
  });

  it("redirects an already-authenticated user away from /login to /dashboard", async () => {
    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue({
      id: "sess_1",
      user_id: "user_1",
      session_token_hash: "hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    });
    const res = await proxy(requestWithCookie("/login", "some-valid-token"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("shows the login form (no redirect) to an unauthenticated visitor", async () => {
    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue(null);
    const res = await proxy(requestWithCookie("/login"));
    expect(res.status).toBe(200);
  });

  it("does not create a redirect loop between /login and /dashboard", async () => {
    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue(null);
    const loginRes = await proxy(requestWithCookie("/login"));
    expect(loginRes.headers.get("location")).toBeNull();

    vi.mocked(findActiveSessionByTokenHash).mockResolvedValue({
      id: "sess_1",
      user_id: "user_1",
      session_token_hash: "hash",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      created_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      revoked_at: null,
    });
    const dashboardRes = await proxy(requestWithCookie("/dashboard", "valid-token"));
    expect(dashboardRes.headers.get("location")).toBeNull();
  });
});
