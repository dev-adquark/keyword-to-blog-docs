import { beforeEach, describe, expect, it, vi } from "vitest";

const publishJSON = vi.fn(async (_req: { flowControl: { key: string; parallelism: number }; deduplicationId: string }) => undefined);

vi.mock("@upstash/qstash", () => ({
  Client: vi.fn().mockImplementation(function Client() {
    return { publishJSON };
  }),
  Receiver: vi.fn(),
}));

vi.mock("@/lib/server/env", () => ({
  env: {
    QSTASH_TOKEN: "test-token",
    NEXT_PUBLIC_API_BASE_URL: "https://example.com",
    QSTASH_CURRENT_SIGNING_KEY: "k1",
    QSTASH_NEXT_SIGNING_KEY: "k2",
  },
  qstashConfigured: () => true,
}));

const { publishJobProcessingMessage } = await import("@/lib/server/qstash");
const { getPlan } = await import("@/lib/plans");

describe("publishJobProcessingMessage — real priority via QStash flowControl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("gives a higher-tier plan higher parallelism than Starter", async () => {
    await publishJobProcessingMessage("job_1", getPlan("starter"));
    await publishJobProcessingMessage("job_2", getPlan("scale"));

    const starterCall = publishJSON.mock.calls[0]![0];
    const scaleCall = publishJSON.mock.calls[1]![0];

    expect(starterCall.flowControl).toEqual({ key: "plan:starter", parallelism: getPlan("starter").maxConcurrentJobs });
    expect(scaleCall.flowControl).toEqual({ key: "plan:scale", parallelism: getPlan("scale").maxConcurrentJobs });
    expect(scaleCall.flowControl.parallelism).toBeGreaterThan(starterCall.flowControl.parallelism);
  });

  it("sets a deduplicationId equal to the jobId, as defense-in-depth against QStash-level redelivery", async () => {
    await publishJobProcessingMessage("job_abc", getPlan("growth"));
    expect(publishJSON.mock.calls[0]![0].deduplicationId).toBe("job_abc");
  });
});
