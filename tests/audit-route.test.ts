import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/rbac", () => ({
  requireOwnerSession: vi.fn(),
}));

vi.mock("@/lib/server/repository", () => ({
  listRecentAuditEvents: vi.fn(),
}));

const { GET } = await import("@/app/api/dashboard/audit/route");
const { requireOwnerSession } = await import("@/lib/server/rbac");
const { listRecentAuditEvents } = await import("@/lib/server/repository");

describe("GET /api/dashboard/audit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires OWNER", async () => {
    vi.mocked(requireOwnerSession).mockRejectedValue(Object.assign(new Error("Forbidden"), { status: 403 }));
    const res = await GET();
    expect(res.status).toBe(403);
    expect(listRecentAuditEvents).not.toHaveBeenCalled();
  });

  it("returns real recorded events, shaped for the dashboard", async () => {
    vi.mocked(requireOwnerSession).mockResolvedValue({ user: { id: "owner_1", role: "OWNER" } as never, customer: {} as never });
    vi.mocked(listRecentAuditEvents).mockResolvedValue([
      {
        id: "aud_1",
        event_type: "login_success",
        actor_user_id: null,
        target_user_id: "user_1",
        target_api_key_id: null,
        metadata: { email: "a@example.com" },
        ip: "1.2.3.4",
        created_at: "2024-01-01T00:00:00.000Z",
        actor_email: null,
        target_user_email: "a@example.com",
        target_api_key_prefix: null,
      },
    ] as never);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0]).toMatchObject({
      eventType: "login_success",
      targetUserEmail: "a@example.com",
      ip: "1.2.3.4",
    });
  });
});
