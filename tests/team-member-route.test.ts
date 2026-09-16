import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/rbac", () => ({
  requireOwnerSession: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  findUserWithCustomerById: vi.fn(),
  listApiKeysWithOwners: vi.fn(),
  getUsageSince: vi.fn(),
  getJobCountsByStatus: vi.fn(),
  findUserById: vi.fn(),
  updateUserStatus: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

const { GET } = await import("@/app/api/dashboard/team/[userId]/route");
const { POST: postStatus } = await import("@/app/api/dashboard/team/[userId]/status/route");
const { requireOwnerSession } = await import("@/lib/server/rbac");
const {
  findUserWithCustomerById,
  listApiKeysWithOwners,
  getUsageSince,
  getJobCountsByStatus,
  findUserById,
  updateUserStatus,
  recordAuditEvent,
} = await import("@/lib/server/repository");

function req(body?: unknown) {
  return new Request("http://localhost/api/dashboard/team/user_1/status", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/dashboard/team/[userId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER", async () => {
    vi.mocked(requireOwnerSession).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ userId: "user_1" }) });
    expect(res.status).toBe(403);
  });

  it("404s for an unknown user id", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findUserWithCustomerById).mockResolvedValue(null);
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ userId: "nope" }) });
    expect(res.status).toBe(404);
  });

  it("returns profile + usage + jobs for a real user", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findUserWithCustomerById).mockResolvedValue({
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
    } as never);
    vi.mocked(listApiKeysWithOwners).mockResolvedValue([
      { id: "key_1", customer_id: "cus_1", status: "active", key_prefix: "ktb_live_abc" } as never,
      { id: "key_2", customer_id: "cus_1", status: "revoked", key_prefix: "ktb_live_def" } as never,
      { id: "key_3", customer_id: "cus_other", status: "active", key_prefix: "ktb_live_ghi" } as never,
    ]);
    vi.mocked(getUsageSince).mockResolvedValue({ requests: 1, words: 100, posts: 1 });
    vi.mocked(getJobCountsByStatus).mockResolvedValue({ queued: 0, processing: 0, succeeded: 1, failed: 0 });

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ userId: "user_1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiKeys).toHaveLength(2); // only cus_1's keys, not cus_other's
    expect(body.activeKeyCount).toBe(1);
    expect(body.revokedKeyCount).toBe(1);
    expect(body.jobs.succeeded).toBe(1);
  });
});

describe("POST /api/dashboard/team/[userId]/status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER", async () => {
    vi.mocked(requireOwnerSession).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const res = await postStatus(req({ status: "disabled" }), { params: Promise.resolve({ userId: "user_1" }) });
    expect(res.status).toBe(403);
  });

  it("disables an active user and records an audit event", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findUserById).mockResolvedValue({ id: "user_1", role: "DEVELOPER", status: "active" } as never);
    vi.mocked(updateUserStatus).mockResolvedValue({ id: "user_1", status: "disabled" } as never);

    const res = await postStatus(req({ status: "disabled" }), { params: Promise.resolve({ userId: "user_1" }) });
    expect(res.status).toBe(200);
    expect(updateUserStatus).toHaveBeenCalledWith("user_1", "disabled");
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "user_status_changed", actorUserId: "owner_1", targetUserId: "user_1" })
    );
  });

  it("refuses to let one OWNER disable a different OWNER", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findUserById).mockResolvedValue({ id: "owner_2", role: "OWNER", status: "active" } as never);

    const res = await postStatus(req({ status: "disabled" }), { params: Promise.resolve({ userId: "owner_2" }) });
    expect(res.status).toBe(403);
    expect(updateUserStatus).not.toHaveBeenCalled();
  });

  it("rejects an invalid status value", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findUserById).mockResolvedValue({ id: "user_1", role: "DEVELOPER", status: "active" } as never);

    const res = await postStatus(req({ status: "deleted" }), { params: Promise.resolve({ userId: "user_1" }) });
    expect(res.status).toBe(400);
    expect(updateUserStatus).not.toHaveBeenCalled();
  });

  it("404s for an unknown user id", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(findUserById).mockResolvedValue(null);

    const res = await postStatus(req({ status: "disabled" }), { params: Promise.resolve({ userId: "nope" }) });
    expect(res.status).toBe(404);
  });
});
