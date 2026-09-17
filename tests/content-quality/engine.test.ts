import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIProvider } from "@/lib/server/generation/provider";
import type { RepairPatch } from "@/lib/types";
import { baseRequest, goodPost } from "./fixtures";

const { runContentQualityPipeline, ContentQualityFailedError } = await import("@/lib/server/content-quality/engine");

// Identical to goodPost() except the introduction is a generic, templated
// opener — everything else (title, body sections, structure) is already
// valid, so only writingQuality's GENERIC_INTRO check should fire. This
// isolates the repair call to fixing exactly one real, targeted problem.
const badPost = () => {
  const base = goodPost();
  return {
    ...base,
    sections: [
      {
        ...base.sections[0]!,
        contentMarkdown: "In today's digital landscape, security matters more than ever for everyone involved.",
      },
      ...base.sections.slice(1),
    ],
  };
};

function fakeProvider(overrides: Partial<AIProvider> = {}): AIProvider {
  return {
    generate: vi.fn(async () => ({ post: goodPost(), groundedInSearch: false })),
    repair: vi.fn(async () => ({ patch: {} as RepairPatch, groundedInSearch: false })),
    ...overrides,
  };
}

describe("runContentQualityPipeline (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes immediately when the first generation is already good — zero AI calls beyond generate", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => ({ post: goodPost(), groundedInSearch: false })) });

    const { post, report } = await runContentQualityPipeline(baseRequest(), provider);

    expect(report.overallStatus).toBe("PASS");
    expect(report.revisionCount).toBe(0);
    expect(post.title).toBe(goodPost().title);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.repair).not.toHaveBeenCalled();
  });

  it("fixes a mechanically-fixable problem (bad slug) for free — never calls repair", async () => {
    const provider = fakeProvider({
      generate: vi.fn(async () => ({ post: goodPost({ slugSuggestion: "Not A Valid Slug!!" }), groundedInSearch: false })),
    });

    const { post, report } = await runContentQualityPipeline(baseRequest(), provider);

    expect(report.overallStatus).toBe("PASS");
    expect(post.slugSuggestion).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(provider.repair).not.toHaveBeenCalled(); // deterministic fix alone was enough
  });

  it("uses exactly ONE targeted repair call for a semantic issue, merges the patch, and preserves untouched sections", async () => {
    const initial = badPost();
    const provider = fakeProvider({
      generate: vi.fn(async () => ({ post: initial, groundedInSearch: false })),
      repair: vi.fn(async () => ({
        patch: { sections: [{ index: 0, contentMarkdown: goodPost().sections[0]!.contentMarkdown }] } as RepairPatch,
        groundedInSearch: false,
      })),
    });

    const { post, report } = await runContentQualityPipeline(baseRequest(), provider);

    expect(report.overallStatus).toBe("PASS");
    expect(report.revisionCount).toBe(1);
    expect(provider.repair).toHaveBeenCalledTimes(1);
    // The repair patch only touched section 0 — everything else came from
    // the original generation, proving "never regenerate the whole article".
    expect(post.title).toBe(initial.title);
  });

  it("passes the repair call only the still-blocking failures, not every warning", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => ({ post: badPost(), groundedInSearch: false })) });
    await runContentQualityPipeline(baseRequest(), provider).catch(() => {});

    const repairArgs = vi.mocked(provider.repair).mock.calls[0]?.[0];
    expect(repairArgs?.failedChecks.every((f) => f.severity === "blocking")).toBe(true);
    expect(repairArgs?.failedChecks.some((f) => f.code === "GENERIC_INTRO")).toBe(true);
  });

  it("never makes more than 2 total Anthropic calls (1 generate + 1 repair), even when the repair doesn't fully fix things", async () => {
    const provider = fakeProvider({
      generate: vi.fn(async () => ({ post: badPost(), groundedInSearch: false })),
      repair: vi.fn(async () => ({ patch: {} as RepairPatch, groundedInSearch: false })), // repair that changes nothing
    });

    await expect(runContentQualityPipeline(baseRequest(), provider)).rejects.toBeInstanceOf(ContentQualityFailedError);
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(provider.repair).toHaveBeenCalledTimes(1);
  });

  it("still passes when the repair introduces a cosmetic, non-blocking issue — the final mechanical pass cleans it up (or it's simply tolerated); it never blocks PASS either way", async () => {
    // Repair fixes the semantic GENERIC_INTRO problem but introduces a
    // cosmetic issue (an unnecessary year in the title) along the way.
    const provider = fakeProvider({
      generate: vi.fn(async () => ({ post: badPost(), groundedInSearch: false })),
      repair: vi.fn(async () => ({
        patch: {
          title: "Strong Password Security Practices: A Guide for 2024",
          sections: [{ index: 0, contentMarkdown: goodPost().sections[0]!.contentMarkdown }],
        } as RepairPatch,
        groundedInSearch: false,
      })),
    });

    const { post, report } = await runContentQualityPipeline(baseRequest(), provider);
    expect(report.overallStatus).toBe("PASS");
    // The free final mechanical pass strips the stray year rather than just tolerating it.
    expect(post.title).not.toMatch(/\b(19|20)\d{2}\b/);
  });

  it("throws CONTENT_QUALITY_FAILED only after both the mechanical pass and the one repair call fail to resolve blocking issues", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => ({ post: badPost(), groundedInSearch: false })) });

    await expect(runContentQualityPipeline(baseRequest(), provider)).rejects.toBeInstanceOf(ContentQualityFailedError);
  });

  it("the thrown error carries the full report plus a minimal, curated public details payload", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => ({ post: badPost(), groundedInSearch: false })) });

    try {
      await runContentQualityPipeline(baseRequest(), provider);
      throw new Error("expected the pipeline to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ContentQualityFailedError);
      const failure = err as InstanceType<typeof ContentQualityFailedError>;
      expect(failure.code).toBe("CONTENT_QUALITY_FAILED");
      expect(failure.report.failedChecks.some((f) => f.code === "GENERIC_INTRO")).toBe(true);
      expect(failure.details?.failedCheckCodes).toContain("GENERIC_INTRO");
      expect(failure.details?.failedChecks).toBeUndefined();
    }
  });

  it("an unsupported/fabricated evidence claim triggers the repair call, and the softened patch passes", async () => {
    const base = goodPost();
    const withFabricatedClaim = {
      ...base,
      sections: [
        base.sections[0]!,
        {
          ...base.sections[1]!,
          contentMarkdown:
            "Professionals who allocate 15-20 focused minutes daily to a single task consistently outpace those who multitask throughout the day.",
        },
        ...base.sections.slice(2),
      ],
    };
    const provider = fakeProvider({
      generate: vi.fn(async () => ({ post: withFabricatedClaim, groundedInSearch: false })),
      repair: vi.fn(async () => ({
        patch: { sections: [{ index: 1, contentMarkdown: base.sections[1]!.contentMarkdown }] } as RepairPatch,
        groundedInSearch: false,
      })),
    });

    const { report } = await runContentQualityPipeline(baseRequest(), provider);

    expect(report.overallStatus).toBe("PASS");
    expect(provider.repair).toHaveBeenCalledTimes(1);
    const repairArgs = vi.mocked(provider.repair).mock.calls[0]?.[0];
    expect(repairArgs?.failedChecks.some((f) => f.code === "UNSUPPORTED_EVIDENCE_CLAIM")).toBe(true);
  });

  it("never lets factualityMode: 'verified' pass, and never spends the repair call trying to fix it", async () => {
    const provider = fakeProvider({ generate: vi.fn(async () => ({ post: goodPost(), groundedInSearch: false })) });

    await expect(
      runContentQualityPipeline(baseRequest({ factualityMode: "verified" }), provider)
    ).rejects.toBeInstanceOf(ContentQualityFailedError);
    expect(provider.repair).not.toHaveBeenCalled();
  });

  describe("freshness: ungrounded currency claims", () => {
    // Extra "pricing" keyword makes the request freshness-sensitive while
    // `topic` (and therefore primaryKeyword) stays "strong password", so
    // keyword-coverage/depth/structure checks on goodPost() are unaffected —
    // isolating the test to only the freshness claim, exactly like badPost().
    const freshnessRequest = () => baseRequest({ keywords: ["strong password", "pricing"] });

    // Identical to goodPost() except one body section states an unqualified
    // current-state price claim.
    const postWithUngroundedClaim = () => {
      const base = goodPost();
      return {
        ...base,
        sections: [
          base.sections[0]!,
          {
            ...base.sections[1]!,
            contentMarkdown:
              "The leading password manager currently costs $29 per year for most users, though free tiers with reduced device limits are also common. Beyond the sticker price, it's worth weighing what each plan actually includes: unlimited device sync, encrypted file storage, family sharing seats, and breach-monitoring alerts all vary significantly between the free and paid tiers. For a household managing more than a handful of accounts, the paid tier's family sharing usually pays for itself within the first year simply by consolidating what would otherwise be several separate subscriptions.",
          },
          ...base.sections.slice(2),
        ],
      };
    };

    it("an ungrounded current-state claim on a freshness-sensitive topic triggers repair (not immediate failure), and a grounded patch passes", async () => {
      const provider = fakeProvider({
        generate: vi.fn(async () => ({ post: postWithUngroundedClaim(), groundedInSearch: false })),
        repair: vi.fn(async () => ({
          patch: { sections: [{ index: 1, contentMarkdown: goodPost().sections[1]!.contentMarkdown }] } as RepairPatch,
          groundedInSearch: true,
        })),
      });

      const { report } = await runContentQualityPipeline(freshnessRequest(), provider);

      expect(report.overallStatus).toBe("PASS");
      expect(report.freshnessStatus).toBe("VERIFIED_CURRENT");
      expect(provider.repair).toHaveBeenCalledTimes(1);
      const repairArgs = vi.mocked(provider.repair).mock.calls[0]?.[0];
      expect(repairArgs?.failedChecks.some((f) => f.code === "UNGROUNDED_CURRENCY_CLAIM")).toBe(true);
    });

    it("fails only after repair still can't ground the claim (never spends a 3rd call)", async () => {
      const provider = fakeProvider({
        generate: vi.fn(async () => ({ post: postWithUngroundedClaim(), groundedInSearch: false })),
        repair: vi.fn(async () => ({ patch: {} as RepairPatch, groundedInSearch: false })),
      });

      await expect(runContentQualityPipeline(freshnessRequest(), provider)).rejects.toBeInstanceOf(
        ContentQualityFailedError
      );
      expect(provider.generate).toHaveBeenCalledTimes(1);
      expect(provider.repair).toHaveBeenCalledTimes(1);
    });

    it("passes immediately (VERIFIED_CURRENT, no repair) when the first generation was already grounded", async () => {
      const provider = fakeProvider({
        generate: vi.fn(async () => ({ post: postWithUngroundedClaim(), groundedInSearch: true })),
      });

      const { report } = await runContentQualityPipeline(freshnessRequest(), provider);

      expect(report.overallStatus).toBe("PASS");
      expect(report.freshnessStatus).toBe("VERIFIED_CURRENT");
      expect(provider.repair).not.toHaveBeenCalled();
    });
  });
});
