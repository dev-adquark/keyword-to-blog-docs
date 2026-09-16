import { describe, expect, it } from "vitest";
import { getPlan, DEFAULT_PLAN_ID } from "@/lib/plans";

describe("internal-team API key rate limit", () => {
  it("pins the starter plan (assigned to every provisioned team account) to exactly 3 requests/day", () => {
    // scripts/provisionTeam.mjs assigns every internal account this plan, and
    // tests/rateLimit.test.ts exercises the actual enforcement (3 allowed,
    // 4th rejected, independent per API key) — this test just guards against
    // someone silently changing the constant this whole design depends on.
    const plan = getPlan("starter");
    expect(plan.requestsPerDay).toBe(3);
  });

  it("is the plan every new account defaults to", () => {
    expect(DEFAULT_PLAN_ID).toBe("starter");
  });
});
