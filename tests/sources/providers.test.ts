import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/env", () => ({
  env: {
    CURRENTS_API_KEY: "currents-test-key",
    NEWSDATA_API_KEY: "newsdata-test-key",
    GDELT_API_TOKEN: "",
    NEWSAPI_ORG_KEY: "newsapi-org-test-key",
  },
}));

const { CurrentsProvider } = await import("@/lib/server/sources/providers/currents");
const { NewsDataProvider } = await import("@/lib/server/sources/providers/newsdata");
const { GdeltProvider } = await import("@/lib/server/sources/providers/gdelt");
const { NewsApiOrgProvider } = await import("@/lib/server/sources/providers/newsapiOrg");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

describe("CurrentsProvider", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes a real-shaped Currents response", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        status: "ok",
        news: [
          {
            id: "abc-123",
            title: "Company X launches new product",
            description: "Details about the launch.",
            url: "https://www.example.com/story",
            author: "Jane Doe",
            language: "en",
            category: ["technology"],
            published: "2026-09-21 10:02:00 +0000",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const provider = new CurrentsProvider();
    const result = await provider.search({ query: "Company X" });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      provider: "currents",
      sourceId: "abc-123",
      title: "Company X launches new product",
      url: "https://www.example.com/story",
      publisher: "example.com",
    });
    expect(result.sources[0]!.publishedAt).toBe(new Date("2026-09-21 10:02:00 +0000").toISOString());
  });

  it("reports (not throws) on a non-2xx response", async () => {
    global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    const result = await new CurrentsProvider().search({ query: "x" });
    expect(result.sources).toHaveLength(0);
    expect(result.error).toBe("currents_http_401");
  });

  it("reports on a malformed (non-ok-status) response body", async () => {
    global.fetch = vi.fn(async () => jsonResponse({ status: "error" })) as unknown as typeof fetch;
    const result = await new CurrentsProvider().search({ query: "x" });
    expect(result.sources).toHaveLength(0);
    expect(result.error).toBe("currents_malformed_response");
  });
});

describe("NewsDataProvider", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes a real-shaped NewsData.io response", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        status: "success",
        results: [
          {
            article_id: "art-1",
            title: "Company X launches new product",
            description: "Details about the launch.",
            content: "ONLY AVAILABLE IN PAID PLANS",
            link: "https://www.ibtimes.co.uk/story",
            creator: ["Bernadette Tixon"],
            language: "english",
            country: ["united kingdom"],
            category: ["technology"],
            pubDate: "2026-09-20 22:11:58",
            pubDateTZ: "UTC",
            source_id: "ibtimes",
            source_name: "International Business Times",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const provider = new NewsDataProvider();
    const result = await provider.search({ query: "Company X" });
    expect(result.sources).toHaveLength(1);
    const source = result.sources[0]!;
    expect(source.provider).toBe("newsdata");
    expect(source.publisher).toBe("International Business Times");
    // Locked-content placeholder must never be passed through as real content.
    expect(source.content).toBeNull();
    expect(source.publishedAt).toBe(new Date("2026-09-20 22:11:58 UTC").toISOString());
  });

  it("nulls out a locked description placeholder too", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        status: "success",
        results: [
          {
            article_id: "art-2",
            title: "Company X launches new product",
            description: "ONLY AVAILABLE IN PROFESSIONAL AND CORPORATE PLANS",
            link: "https://example.com/story",
            pubDate: "2026-09-21 10:00:00",
            pubDateTZ: "UTC",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const result = await new NewsDataProvider().search({ query: "x" });
    expect(result.sources[0]!.description).toBeNull();
  });
});

describe("GdeltProvider", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("is always configured (free/keyless public API)", () => {
    expect(new GdeltProvider().isConfigured()).toBe(true);
  });

  it("normalizes GDELT's documented artlist JSON shape (url/title/domain/language/sourcecountry)", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        articles: [
          {
            url: "https://example.com/story",
            title: "Company X launches new product",
            seendate: "20260921T100000Z",
            domain: "example.com",
            language: "English",
            sourcecountry: "United States",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const result = await new GdeltProvider().search({ query: "Company X" });
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({
      provider: "gdelt",
      title: "Company X launches new product",
      url: "https://example.com/story",
      publisher: "example.com",
      country: "United States",
    });
  });

  it("REGRESSION: never treats GDELT's seendate (crawl/discovery time) as the article's publishedAt — a stale article GDELT merely re-crawled recently must never falsely satisfy freshness", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        articles: [
          {
            url: "https://example.com/story",
            title: "Company X launches new product",
            seendate: "20260921T100000Z", // seen today — but this is NOT proof the article was published today
            domain: "example.com",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const result = await new GdeltProvider().search({ query: "Company X" });
    expect(result.sources[0]!.publishedAt).toBeNull();
  });

  it("degrades to zero sources (not a crash) when GDELT returns its plain-text rate-limit notice", async () => {
    global.fetch = vi.fn(async () => new Response("Please limit requests to one every 5 seconds", { status: 200 })) as unknown as typeof fetch;
    const result = await new GdeltProvider().search({ query: "x" });
    expect(result.sources).toHaveLength(0);
    expect(result.error).toBe("gdelt_non_json_response");
  });
});

describe("NewsApiOrgProvider", () => {
  const originalFetch = global.fetch;
  beforeEach(() => vi.useRealTimers());
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("normalizes a real-shaped newsapi.org response and strips the free-tier truncation marker", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        status: "ok",
        articles: [
          {
            source: { id: null, name: "CNBC" },
            author: "Jane Doe",
            title: "Company X launches new product",
            description: "Company X today announced a major update… [+120 chars]",
            url: "https://www.cnbc.com/story",
            publishedAt: "2026-09-21T10:02:50Z",
            content: "Company X today announced… [+3897 chars]",
          },
        ],
      })
    ) as unknown as typeof fetch;

    const result = await new NewsApiOrgProvider().search({ query: "Company X" });
    expect(result.sources).toHaveLength(1);
    const source = result.sources[0]!;
    expect(source.provider).toBe("newsapi_org");
    expect(source.publisher).toBe("CNBC");
    expect(source.publishedAt).toBe("2026-09-21T10:02:50.000Z");
    expect(source.description).toBe("Company X today announced a major update");
    expect(source.content).toBe("Company X today announced");
  });

  it("filters out newsapi.org's '[Removed]' placeholder articles (a real response shape for removed/unavailable content)", async () => {
    global.fetch = vi.fn(async () =>
      jsonResponse({
        status: "ok",
        articles: [
          { source: { name: "[Removed]" }, title: "[Removed]", description: null, url: "https://removed.example.com", publishedAt: "2026-09-21T10:00:00Z", content: "[Removed]" },
        ],
      })
    ) as unknown as typeof fetch;

    const result = await new NewsApiOrgProvider().search({ query: "x" });
    expect(result.sources).toHaveLength(0);
  });

  it("reports (not throws) on a non-2xx response", async () => {
    global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    const result = await new NewsApiOrgProvider().search({ query: "x" });
    expect(result.sources).toHaveLength(0);
    expect(result.error).toBe("newsapi_org_http_401");
  });
});
