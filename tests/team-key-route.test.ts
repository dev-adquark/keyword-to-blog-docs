import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/rbac", () => ({
  requireOwnerSession: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  findApiKeyWithOwnerById: vi.fn(),
  getUsageSinceForApiKey: vi.fn(),
  listRecentUsageEventsForApiKey: vi.fn(),
  revokeApiKeyAsOwner: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

const { GET } = await import("@/app/api/dashboard/team/keys/[keyId]/route");
const { POST: revoke } = await import("@/app/api/dashboard/team/keys/[keyId]/revoke/route");
const { requireOwnerSession } = await import("@/lib/server/rbac");
const {
  findApiKeyWithOwnerById,
  getUsageSinceForApiKey,
  listRecentUsageEventsForApiKey,
  revokeApiKeyAsOwner,
  recordAuditEvent,
} = await import("@/lib/server/repository");

describe("GET /api/dashboard/team/keys/[keyId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER", async () => {
    vi.mocked(requireOwnerSession).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ keyId: "key_1" }) });
    expect(res.status).toBe(403);
  });

  it("404s for an unknown key id", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findApiKeyWithOwnerById).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ keyId: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("returns key details, owner, and usage — never the raw secret", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findApiKeyWithOwnerById).mockResolvedValue({
      id: "key_1",
      customer_id: "cus_1",
      key_prefix: "ktb_live_abc",
      key_hash: "should-never-appear",
      name: "Prod",
      environment: "live",
      scopes: ["generate"],
      status: "active",
      created_at: "2024-01-01T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
      user_id: "user_1",
      user_email: "a@example.com",
      user_name: "A",
    } as never);
    vi.mocked(getUsageSinceForApiKey).mockResolvedValue({
      requests: 3,
      words: 900,
      posts: 3,
      failed: 0,
      rateLimited: 1,
    });
    vi.mocked(listRecentUsageEventsForApiKey).mockResolvedValue([]);

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ keyId: "key_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key.owner).toEqual({ id: "user_1", email: "a@example.com", name: "A" });
    expect(body.usage.rateLimitedThisMonth).toBe(1);
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("should-never-appear");
    expect(raw).not.toContain("key_hash");
  });
});

describe("POST /api/dashboard/team/keys/[keyId]/revoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER", async () => {
    vi.mocked(requireOwnerSession).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const res = await revoke(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ keyId: "key_1" }),
    });
    expect(res.status).toBe(403);
    expect(revokeApiKeyAsOwner).not.toHaveBeenCalled();
  });

  it("revokes any team member's key (not restricted to the caller's own customer) and audit-logs it", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(revokeApiKeyAsOwner).mockResolvedValue(true);

    const res = await revoke(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ keyId: "key_other_user" }),
    });
    expect(res.status).toBe(200);
    expect(revokeApiKeyAsOwner).toHaveBeenCalledWith("key_other_user");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "api_key_revoked", actorUserId: "owner_1", targetApiKeyId: "key_other_user" })
    );
  });

  it("404s when the key doesn't exist or is already revoked", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(revokeApiKeyAsOwner).mockResolvedValue(false);

    const res = await revoke(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ keyId: "already_gone" }),
    });
    expect(res.status).toBe(404);
    expect(recordAuditEvent).not.toHaveBeenCalled();
  });
});
