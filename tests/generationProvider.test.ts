import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: { ANTHROPIC_API_KEY: "sk-test", AI_MODEL: "claude-haiku-4-5-20251001" },
}));

const { AnthropicProvider } = await import("@/lib/server/generation/anthropic");
const { ApiError } = await import("@/lib/server/apiErrors");

const baseRequest = {
  keywords: ["test"],
  language: "en",
  tone: "professional" as const,
  constraints: { maxWords: 500 },
  format: { responseTypes: ["json" as const] },
};

const validPost = {
  title: "t",
  slugSuggestion: "t",
  meta: { description: "d", primaryKeyword: "test" },
  outline: { h1: "t", h2: ["a"] },
  sections: [{ type: "body", contentMarkdown: "content" }],
  conclusion: "the end",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function searchResultBlock(toolUseId: string, pageAge?: string) {
  return {
    type: "web_search_tool_result",
    tool_use_id: toolUseId,
    content: [{ type: "web_search_result", url: "https://example.com", title: "Pricing", ...(pageAge ? { page_age: pageAge } : {}) }],
  };
}

describe("AnthropicProvider", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("maps a model safety refusal to PROHIBITED_INPUT without retrying", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ content: [], stop_reason: "refusal" })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    await expect(provider.generate(baseRequest)).rejects.toMatchObject({
      code: "PROHIBITED_INPUT",
    } satisfies Partial<InstanceType<typeof ApiError>>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on a transient 503 and succeeds on the second attempt", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("service unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    const result = await provider.generate(baseRequest);
    expect(result.post.title).toBe("t");
    expect(result.groundedInSearch).toBe(false);
    expect(result.groundedInTodaySource).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient 400 error", async () => {
    const fetchMock = vi.fn(async () => new Response("bad request", { status: 400 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    await expect(provider.generate(baseRequest)).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    } satisfies Partial<InstanceType<typeof ApiError>>);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a request timeout as transient and retries once", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
      .mockResolvedValueOnce(
        jsonResponse({
          content: [{ type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    const result = await provider.generate(baseRequest);
    expect(result.post.title).toBe("t");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("treats a paused long-running search turn (pause_turn) as transient and retries once", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ content: [{ type: "text", text: "..." }], stop_reason: "pause_turn" }))
      .mockResolvedValueOnce(
        jsonResponse({ content: [{ type: "text", text: JSON.stringify(validPost) }], stop_reason: "end_turn" })
      );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    const result = await provider.generate(baseRequest);
    expect(result.post.title).toBe("t");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("only offers the web_search tool when the topic is freshness-sensitive", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ content: [{ type: "text", text: JSON.stringify(validPost) }], stop_reason: "end_turn" })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    await provider.generate(baseRequest); // "test" keywords — not freshness-sensitive
    const calls = fetchMock.mock.calls as unknown as Array<[string, { body: string }]>;
    let sentBody = JSON.parse(calls[0]![1].body);
    expect(sentBody.tools).toBeUndefined();

    await provider.generate({ ...baseRequest, topic: "latest software pricing" });
    sentBody = JSON.parse(calls[1]![1].body);
    expect(sentBody.tools).toEqual([{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]);
  });

  it("ignores narration text before the search, not the final answer after it", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: [
          { type: "text", text: "I'll look up current pricing first." },
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "pricing" } },
          searchResultBlock("srvtoolu_1", "today"),
          { type: "text", text: JSON.stringify(validPost) },
        ],
        stop_reason: "end_turn",
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    const result = await provider.generate({ ...baseRequest, topic: "latest software pricing" });
    expect(result.post.title).toBe("t");
    expect(result.groundedInSearch).toBe(true);
    expect(result.groundedInTodaySource).toBe(true);
  });

  it("REGRESSION (production 500): reconstructs the final answer when citations split it across multiple consecutive text blocks", async () => {
    // Anthropic always attaches citations to web-search-grounded content, and
    // its own docs show the final answer arriving as MULTIPLE separate text
    // blocks split at citation boundaries (e.g. "Based on the search
    // results, " + "Claude Shannon was born..." as two blocks for one
    // sentence). Taking only the last block silently truncated the JSON on
    // every real freshness-sensitive request, causing schema validation to
    // fail 3/3 retries and the whole call to burn ~60s before a 500.
    const jsonText = JSON.stringify(validPost);
    const splitPoint = Math.floor(jsonText.length / 2);
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: [
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "pricing" } },
          searchResultBlock("srvtoolu_1", "today"),
          // The final answer, split into two consecutive text blocks — the
          // second one carries a `citations` array, the first doesn't.
          { type: "text", text: jsonText.slice(0, splitPoint) },
          { type: "text", text: jsonText.slice(splitPoint), citations: [{ type: "web_search_result_location" }] },
        ],
        stop_reason: "end_turn",
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    const result = await provider.generate({ ...baseRequest, topic: "latest software pricing" });
    expect(result.post.title).toBe("t");
    expect(result.groundedInSearch).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1); // reconstructed correctly first try — no wasted retries
  });

  it("does not consider a search 'grounded' when the result is an error or empty", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: [
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "pricing" } },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
          },
          { type: "text", text: JSON.stringify(validPost) },
        ],
        stop_reason: "end_turn",
      })
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const provider = new AnthropicProvider();
    const result = await provider.generate({ ...baseRequest, topic: "latest software pricing" });
    expect(result.groundedInSearch).toBe(false);
    expect(result.groundedInTodaySource).toBe(false);
  });

  describe("strict TODAY-only freshness grounding", () => {
    const todayIso = () => new Date().toISOString().slice(0, 10);
    const todayHuman = () => new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date());

    it("treats page_age literally 'today' as grounded-in-today", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [searchResultBlock("t1", "today"), { type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInTodaySource).toBe(true);
    });

    it("treats a relative 'N hours ago' page_age as grounded-in-today", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [searchResultBlock("t1", "3 hours ago"), { type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInTodaySource).toBe(true);
    });

    it("treats an explicit page_age date matching today's real calendar date as grounded-in-today", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [searchResultBlock("t1", todayHuman()), { type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInTodaySource).toBe(true);
    });

    it("REJECTS 'yesterday' — never treats older-than-today sources as current", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [searchResultBlock("t1", "1 day ago"), { type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInSearch).toBe(true);
      expect(result.groundedInTodaySource).toBe(false);
    });

    it("REJECTS an explicit older date", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [searchResultBlock("t1", "January 1, 2020"), { type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInTodaySource).toBe(false);
    });

    it("REJECTS a missing/unparseable page_age (never assumes today by default)", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [searchResultBlock("t1"), { type: "text", text: JSON.stringify(validPost) }],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInTodaySource).toBe(false);
    });

    it("counts as grounded-in-today if ANY of several results is today, even if others are older", async () => {
      const fetchMock = vi.fn(async () =>
        jsonResponse({
          content: [
            {
              type: "web_search_tool_result",
              tool_use_id: "t1",
              content: [
                { type: "web_search_result", url: "https://old.example.com", title: "Old", page_age: "January 1, 2020" },
                { type: "web_search_result", url: "https://new.example.com", title: "New", page_age: "today" },
              ],
            },
            { type: "text", text: JSON.stringify(validPost) },
          ],
          stop_reason: "end_turn",
        })
      );
      global.fetch = fetchMock as unknown as typeof fetch;
      const result = await new AnthropicProvider().generate({ ...baseRequest, topic: "latest software pricing" });
      expect(result.groundedInTodaySource).toBe(true);
    });
  });
});
