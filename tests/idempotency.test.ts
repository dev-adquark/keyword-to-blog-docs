import { describe, it, expect, vi, beforeEach } from "vitest";

const state = new Map<string, { request_hash: string; response: unknown; status_code: number }>();

vi.mock("@/lib/server/db", () => ({
  query: vi.fn(async () => []),
  queryOne: vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes("INSERT INTO idempotency_records")) {
      const [, idempotencyKey, requestHash, response, statusCode] = params;
      const key = `${String(params[0])}:${String(idempotencyKey)}`;
      if (state.has(key)) {
        return null;
      }
      const record = {
        request_hash: String(requestHash),
        response,
        status_code: Number(statusCode),
      };
      state.set(key, record);
      return record;
    }

    if (sql.includes("SELECT request_hash, response, status_code")) {
      const [, idempotencyKey] = params;
      const key = `${String(params[0])}:${String(idempotencyKey)}`;
      return state.get(key) ?? null;
    }

    if (sql.includes("UPDATE idempotency_records")) {
      const [, idempotencyKey, requestHash, response, statusCode] = params;
      const key = `${String(params[0])}:${String(idempotencyKey)}`;
      state.set(key, {
        request_hash: String(requestHash),
        response,
        status_code: Number(statusCode),
      });
      return [];
    }

    return null;
  }),
}));

const { claimIdempotencyRequest } = await import("@/lib/server/repository");

describe("claimIdempotencyRequest", () => {
  beforeEach(() => {
    state.clear();
  });

  it("declares a unique winner for the same request key", async () => {
    const resultA = await claimIdempotencyRequest({
      apiKeyId: "key_1",
      idempotencyKey: "req-123",
      requestHash: "hash-a",
      response: { status: "processing" },
      statusCode: 202,
    });
    const resultB = await claimIdempotencyRequest({
      apiKeyId: "key_1",
      idempotencyKey: "req-123",
      requestHash: "hash-a",
      response: { status: "processing" },
      statusCode: 202,
    });

    expect(resultA.claimed).toBe(true);
    expect(resultB.claimed).toBe(false);
  });
});
