import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/auth", () => ({
  requireSession: vi.fn(),
}));

const { requireOwnerSession, isValidTeamRole, TEAM_ROLES } = await import("@/lib/server/rbac");
const { requireSession } = await import("@/lib/server/auth");

function sessionWithRole(role: string) {
  return {
    user: { id: "user_1", role, email: "x@example.com" } as never,
    customer: { id: "cus_1" } as never,
  };
}

describe("isValidTeamRole", () => {
  it("accepts exactly the four defined roles", () => {
    for (const role of TEAM_ROLES) {
      expect(isValidTeamRole(role)).toBe(true);
    }
  });

  it("rejects anything else, including case variants and empty strings", () => {
    expect(isValidTeamRole("owner")).toBe(false);
    expect(isValidTeamRole("ADMIN")).toBe(false);
    expect(isValidTeamRole("")).toBe(false);
  });
});

describe("requireOwnerSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session for an OWNER", async () => {
    vi.mocked(requireSession).mockResolvedValue(sessionWithRole("OWNER"));
    const session = await requireOwnerSession();
    expect(session.user.role).toBe("OWNER");
  });

  it("throws a 403 for a non-OWNER role", async () => {
    vi.mocked(requireSession).mockResolvedValue(sessionWithRole("DEVELOPER"));
    await expect(requireOwnerSession()).rejects.toMatchObject({ status: 403 });
  });

  it("propagates the 401 from requireSession when there is no session at all", async () => {
    vi.mocked(requireSession).mockRejectedValue(Object.assign(new Error("Not authenticated"), { status: 401 }));
    await expect(requireOwnerSession()).rejects.toMatchObject({ status: 401 });
  });
});
