import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/rbac", () => ({
  requireOwnerSession: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  listUsersWithCustomers: vi.fn(),
  listApiKeysWithOwners: vi.fn(),
  getUsageSince: vi.fn(),
  listRecentUsageEventsForTeam: vi.fn(),
}));

const { GET } = await import("@/app/api/dashboard/team/route");
const { requireOwnerSession } = await import("@/lib/server/rbac");
const {
  listUsersWithCustomers,
  listApiKeysWithOwners,
  getUsageSince,
  listRecentUsageEventsForTeam,
} = await import("@/lib/server/repository");

describe("GET /api/dashboard/team", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a non-OWNER caller with the status requireOwnerSession throws", async () => {
    vi.mocked(requireOwnerSession).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(listUsersWithCustomers).not.toHaveBeenCalled();
  });

  it("aggregates real per-member usage — never fabricated numbers", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({
      user: { id: "owner_1", role: "OWNER" } as never,
      customer: { id: "cus_owner" } as never,
    });
    vi.mocked(listUsersWithCustomers).mockResolvedValue([
      {
        id: "user_1",
        email: "a@example.com",
        name: "A",
        status: "active",
        role: "DEVELOPER",
        last_login_at: null,
        password_hash: "x",
        created_at: "2024-01-01T00:00:00.000Z",
        updated_at: "2024-01-01T00:00:00.000Z",
        customer_id: "cus_1",
      },
    ] as never);
    vi.mocked(listApiKeysWithOwners).mockResolvedValue([
      {
        id: "key_1",
        customer_id: "cus_1",
        key_prefix: "ktb_live_abc",
        key_hash: "h",
        name: "Prod",
        environment: "live",
        scopes: ["generate"],
        status: "active",
        created_at: "2024-01-01T00:00:00.000Z",
        last_used_at: "2024-01-02T00:00:00.000Z",
        revoked_at: null,
        user_id: "user_1",
        user_email: "a@example.com",
        user_name: "A",
      },
    ] as never);
    vi.mocked(getUsageSince).mockResolvedValue({ requests: 2, words: 500, posts: 2 });
    vi.mocked(listRecentUsageEventsForTeam).mockResolvedValue([]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.members).toHaveLength(1);
    expect(body.members[0]).toMatchObject({
      id: "user_1",
      email: "a@example.com",
      activeApiKeyCount: 1,
      requestsToday: 2,
    });
    expect(body.summary.activeMembers).toBe(1);
    expect(body.summary.activeApiKeys).toBe(1);
    expect(body.summary.requestsToday).toBe(2);
    expect(body.summary.postsToday).toBe(2);
    expect(body.summary.wordsToday).toBe(500);
  });

  it("never returns a full API key value, only the prefix", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({
      user: { id: "owner_1", role: "OWNER" } as never,
      customer: { id: "cus_owner" } as never,
    });
    vi.mocked(listUsersWithCustomers).mockResolvedValue([]);
    vi.mocked(listApiKeysWithOwners).mockResolvedValue([]);
    vi.mocked(getUsageSince).mockResolvedValue({ requests: 0, words: 0, posts: 0 });
    vi.mocked(listRecentUsageEventsForTeam).mockResolvedValue([]);

    const res = await GET();
    const raw = JSON.stringify(await res.json());
    expect(raw).not.toMatch(/ktb_(live|test)_[A-Za-z0-9_-]{20,}/);
  });
});
