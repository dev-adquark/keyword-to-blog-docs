import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const testSchema = z.object({ ok: z.boolean() });

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function textOf(body: object) {
  return { content: [{ type: "text", text: JSON.stringify(body) }], stop_reason: "end_turn" };
}

describe("runWithRetries — Anthropic API key failover", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/server/env");
  });

  it("never calls a second key when only one key is configured and it succeeds (no regression for single-key setups)", async () => {
    vi.doMock("@/lib/server/env", () => ({
      env: { ANTHROPIC_API_KEY: "key-primary", ANTHROPIC_API_KEY_SECONDARY: "", AI_MODEL: "claude-haiku-4-5-20251001" },
    }));
    const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");

    const fetchMock = vi.fn(async () => jsonResponse(textOf({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runWithRetries({
      prompt: "p",
      system: "s",
      maxTokens: 100,
      schema: testSchema,
      schemaFailureMessage: "x",
      finalFailureMessage: "y",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails over to the secondary key immediately (no wasted retries) when the primary key is invalid (401)", async () => {
    vi.doMock("@/lib/server/env", () => ({
      env: { ANTHROPIC_API_KEY: "key-primary-invalid", ANTHROPIC_API_KEY_SECONDARY: "key-secondary-valid", AI_MODEL: "claude-haiku-4-5-20251001" },
    }));
    const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const key = (init?.headers as Record<string, string>)["x-api-key"];
      if (key === "key-primary-invalid") {
        return new Response(JSON.stringify({ type: "error", error: { type: "authentication_error" } }), { status: 401 });
      }
      return jsonResponse(textOf({ ok: true }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runWithRetries({
      prompt: "p",
      system: "s",
      maxTokens: 100,
      schema: testSchema,
      schemaFailureMessage: "x",
      finalFailureMessage: "y",
    });

    expect(result).toEqual({ ok: true });
    // Exactly 2 raw HTTP calls: 1 failed attempt on the bad key (no retries
    // wasted on it) + 1 successful attempt on the failover key.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("never calls both keys concurrently — the secondary is only attempted after the primary's call has fully resolved", async () => {
    vi.doMock("@/lib/server/env", () => ({
      env: { ANTHROPIC_API_KEY: "key-primary-invalid", ANTHROPIC_API_KEY_SECONDARY: "key-secondary-valid", AI_MODEL: "claude-haiku-4-5-20251001" },
    }));
    const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");

    let concurrentCalls = 0;
    let maxConcurrent = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      concurrentCalls++;
      maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
      await new Promise((r) => setTimeout(r, 10));
      const key = (init?.headers as Record<string, string>)["x-api-key"];
      concurrentCalls--;
      if (key === "key-primary-invalid") return new Response("unauthorized", { status: 401 });
      return jsonResponse(textOf({ ok: true }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await runWithRetries({
      prompt: "p",
      system: "s",
      maxTokens: 100,
      schema: testSchema,
      schemaFailureMessage: "x",
      finalFailureMessage: "y",
    });

    expect(maxConcurrent).toBe(1);
  });

  it("stops immediately once a key succeeds — never spends a call on a key that would otherwise be tried next", async () => {
    vi.doMock("@/lib/server/env", () => ({
      env: { ANTHROPIC_API_KEY: "key-primary-valid", ANTHROPIC_API_KEY_SECONDARY: "key-secondary-valid", AI_MODEL: "claude-haiku-4-5-20251001" },
    }));
    const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");

    const fetchMock = vi.fn(async () => jsonResponse(textOf({ ok: true })));
    global.fetch = fetchMock as unknown as typeof fetch;

    await runWithRetries({
      prompt: "p",
      system: "s",
      maxTokens: 100,
      schema: testSchema,
      schemaFailureMessage: "x",
      finalFailureMessage: "y",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1); // primary succeeded — secondary never touched
  });

  it("fails with INTERNAL_ERROR only after BOTH keys are exhausted", async () => {
    vi.doMock("@/lib/server/env", () => ({
      env: { ANTHROPIC_API_KEY: "key-a", ANTHROPIC_API_KEY_SECONDARY: "key-b", AI_MODEL: "claude-haiku-4-5-20251001" },
    }));
    const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");
    const { ApiError } = await import("@/lib/server/apiErrors");

    const fetchMock = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      runWithRetries({
        prompt: "p",
        system: "s",
        maxTokens: 100,
        schema: testSchema,
        schemaFailureMessage: "x",
        finalFailureMessage: "y",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_ERROR" } satisfies Partial<InstanceType<typeof ApiError>>);
    expect(fetchMock).toHaveBeenCalledTimes(2); // one failed attempt per key, no wasted retries on either
  });

  it("still retries a transient (5xx) failure on the SAME key before failing over", async () => {
    vi.doMock("@/lib/server/env", () => ({
      env: { ANTHROPIC_API_KEY: "key-a", ANTHROPIC_API_KEY_SECONDARY: "key-b", AI_MODEL: "claude-haiku-4-5-20251001" },
    }));
    const { runWithRetries } = await import("@/lib/server/generation/anthropicClient");

    let calls = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      calls++;
      const key = (init?.headers as Record<string, string>)["x-api-key"];
      if (key === "key-a" && calls === 1) return new Response("server error", { status: 503 });
      return jsonResponse(textOf({ ok: true }));
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await runWithRetries({
      prompt: "p",
      system: "s",
      maxTokens: 100,
      schema: testSchema,
      schemaFailureMessage: "x",
      finalFailureMessage: "y",
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2); // retried key-a once (503), succeeded — key-b never needed
    expect((fetchMock.mock.calls[1]![1] as RequestInit & { headers: Record<string, string> }).headers["x-api-key"]).toBe(
      "key-a"
    );
  });
});
