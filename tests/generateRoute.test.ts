import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /v1/generate's job is to wire auth → idempotency → the quality
// pipeline → usage metering → response — NOT to re-verify quality-check
// behavior (that lives in tests/content-quality/). Mocking the pipeline
// here also lets us prove sync/async parity: both this route and
// jobProcessor.ts call the exact same runContentQualityPipeline.
vi.mock("@/lib/server/withApiAuth", () => ({
  authenticate: vi.fn(),
}));

vi.mock("@/lib/server/content-quality/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/content-quality/engine")>();
  return {
    ContentQualityFailedError: actual.ContentQualityFailedError,
    runContentQualityPipeline: vi.fn(),
    toQualitySummary: vi.fn(() => ({ status: "pass", score: 92, revisionCount: 0, qualityVersion: "2.0.0" })),
  };
});

vi.mock("@/lib/server/repository", () => ({
  recordUsageEvent: vi.fn(async () => undefined),
  recordContentQualityReport: vi.fn(async () => undefined),
  claimIdempotencyRequest: vi.fn(async () => ({ claimed: true, existing: null })),
  updateIdempotencyRecord: vi.fn(async () => undefined),
}));

const { POST } = await import("@/app/api/v1/generate/route");
const { authenticate } = await import("@/lib/server/withApiAuth");
const { runContentQualityPipeline } = await import("@/lib/server/content-quality/engine");
const { recordUsageEvent, recordContentQualityReport } = await import("@/lib/server/repository");

const validPost = {
  title: "How to Choose a Strong Password",
  slugSuggestion: "how-to-choose-a-strong-password",
  meta: { description: "d", primaryKeyword: "strong password" },
  outline: { h1: "H1", h2: ["a"] },
  sections: [{ type: "body" as const, contentMarkdown: "some real body content here" }],
  conclusion: "the end",
};

const passingReport = {
  qualityVersion: "2.0.0",
  overallStatus: "PASS" as const,
  overallScore: 92,
  writingScore: 92,
  originalityScore: 92,
  depthScore: 92,
  seoScore: 92,
  readabilityScore: 92,
  keywordScore: 92,
  structureScore: 92,
  factualityStatus: "STANDARD_UNVERIFIED" as const,
  freshnessStatus: "NOT_APPLICABLE" as const,
  wordCount: 5,
  keywordCoverage: 1,
  revisionCount: 0,
  passedChecks: [],
  failedChecks: [],
  warnings: [],
  revisionReasons: [],
};

function authContext() {
  return {
    ok: true as const,
    context: {
      requestId: "req_1",
      apiKey: { id: "key_1" } as never,
      customer: { id: "cus_1" } as never,
      plan: { maxWordsPerRequest: 8000 } as never,
    },
    rateLimitHeaders: {},
  };
}

function generateRequest(body: unknown) {
  return new Request("http://localhost/api/v1/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  keywords: ["strong password"],
  language: "en",
  tone: "professional",
  constraints: { maxWords: 500 },
  format: { responseTypes: ["json"] },
};

describe("POST /v1/generate — content quality pipeline wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authenticate).mockResolvedValue(authContext());
  });

  it("uses the SAME runContentQualityPipeline as the async job processor (sync/async parity)", async () => {
    vi.mocked(runContentQualityPipeline).mockResolvedValue({ post: validPost, report: passingReport });

    const res = await POST(generateRequest(validBody));

    expect(res.status).toBe(200);
    expect(runContentQualityPipeline).toHaveBeenCalledTimes(1);
    const body = await res.json();
    expect(body.quality).toEqual({ status: "pass", score: 92, revisionCount: 0, qualityVersion: "2.0.0" });
  });

  it("REGRESSION: accepts a request with no constraints.maxWords at all — it's optional now, not required", async () => {
    vi.mocked(runContentQualityPipeline).mockResolvedValue({ post: validPost, report: passingReport });

    const bodyWithoutMaxWords = {
      keywords: ["strong password"],
      language: "en",
      tone: "professional",
      constraints: {},
      format: { responseTypes: ["json"] },
    };
    const res = await POST(generateRequest(bodyWithoutMaxWords));

    expect(res.status).toBe(200);
    expect(runContentQualityPipeline).toHaveBeenCalledTimes(1);
  });

  it("REGRESSION: never rejects for exceeding the plan's maxWordsPerRequest cap when maxWords is omitted (nothing to compare)", async () => {
    vi.mocked(authenticate).mockResolvedValue({
      ok: true,
      context: {
        requestId: "req_1",
        apiKey: { id: "key_1" } as never,
        customer: { id: "cus_1" } as never,
        plan: { maxWordsPerRequest: 800 } as never, // lowest real plan tier
      },
      rateLimitHeaders: {},
    });
    vi.mocked(runContentQualityPipeline).mockResolvedValue({ post: validPost, report: passingReport });

    const res = await POST(
      generateRequest({
        keywords: ["strong password"],
        language: "en",
        tone: "professional",
        constraints: {},
        format: { responseTypes: ["json"] },
      })
    );

    expect(res.status).toBe(200);
  });

  it("records exactly ONE usage event per external request, regardless of internal repair", async () => {
    vi.mocked(runContentQualityPipeline).mockResolvedValue({
      post: validPost,
      report: { ...passingReport, revisionCount: 1 }, // pipeline internally used its one repair call
    });

    await POST(generateRequest(validBody));

    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
    expect(recordUsageEvent).toHaveBeenCalledWith(expect.objectContaining({ success: true, statusCode: 200 }));
  });

  it("returns CONTENT_QUALITY_FAILED (422) only when the pipeline genuinely exhausts its repair path", async () => {
    const { ContentQualityFailedError } = await import("@/lib/server/content-quality/engine");
    const failingReport = { ...passingReport, overallStatus: "FAIL" as const, failedChecks: [{ code: "LOW_EXPERT_DEPTH", severity: "blocking" as const, message: "too shallow" }] };
    vi.mocked(runContentQualityPipeline).mockRejectedValue(new ContentQualityFailedError(failingReport));

    const res = await POST(generateRequest(validBody));

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("CONTENT_QUALITY_FAILED");
    expect(recordContentQualityReport).toHaveBeenCalledWith(expect.objectContaining({ overallStatus: "FAIL" }));
    // Still exactly one usage event even on failure — no double-metering.
    expect(recordUsageEvent).toHaveBeenCalledTimes(1);
  });

  it("never leaks internal report detail (only curated failedCheckCodes) in the public error response", async () => {
    const { ContentQualityFailedError } = await import("@/lib/server/content-quality/engine");
    const failingReport = {
      ...passingReport,
      overallStatus: "FAIL" as const,
      failedChecks: [{ code: "UNSUPPORTED_EVIDENCE_CLAIM", severity: "blocking" as const, message: "very specific internal detail" }],
    };
    vi.mocked(runContentQualityPipeline).mockRejectedValue(new ContentQualityFailedError(failingReport));

    const res = await POST(generateRequest(validBody));
    const body = await res.json();

    expect(body.error.details.failedCheckCodes).toContain("UNSUPPORTED_EVIDENCE_CLAIM");
    expect(JSON.stringify(body)).not.toContain("very specific internal detail");
  });
});
