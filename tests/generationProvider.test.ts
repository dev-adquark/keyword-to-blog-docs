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

  it("takes the LAST text block as the final answer, not the first (Claude may narrate before searching)", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        content: [
          { type: "text", text: "I'll look up current pricing first." },
          { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "pricing" } },
          {
            type: "web_search_tool_result",
            tool_use_id: "srvtoolu_1",
            content: [{ type: "web_search_result", url: "https://example.com", title: "Pricing", page_age: "today" }],
          },
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
  });
});
