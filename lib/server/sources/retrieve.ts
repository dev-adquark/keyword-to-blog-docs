import "server-only";
import type { FreshnessPolicy, RetrievalAttemptLog, SourceProviderName, SourceRetrievalReport } from "@/lib/types";
import type { SourceProvider } from "./providers/provider";
import { CurrentsProvider } from "./providers/currents";
import { NewsDataProvider } from "./providers/newsdata";
import { GdeltProvider } from "./providers/gdelt";
import { buildSourcePack } from "./sourcePack";

const MAX_RETRIEVAL_ATTEMPTS = 3;

export interface RetrieveSourcesInput {
  requestId: string;
  topic: string;
  keywords: string[];
  freshnessPolicy: FreshnessPolicy;
  language?: string;
  country?: string;
  /** Injectable for tests — defaults to the real provider adapters. */
  providers?: SourceProvider[];
  now?: Date;
}

function defaultProviders(): SourceProvider[] {
  return [new CurrentsProvider(), new NewsDataProvider(), new GdeltProvider()];
}

/** Widens the search on each retry — never by relaxing the freshness
 * policy (that stays fixed across every attempt), only by trying a
 * different query/keyword combination and asking for more candidates. */
function queryForAttempt(topic: string, keywords: string[], attempt: number): string {
  const primary = (topic || keywords[0] || "").trim();
  if (attempt === 1) return primary || keywords.join(" ");
  if (attempt === 2) return keywords.slice(0, 3).join(" ") || primary;
  return [primary, ...keywords].filter(Boolean).join(" ");
}

/**
 * Retrieve → normalize → validate, up to MAX_RETRIEVAL_ATTEMPTS times.
 * These are source-retrieval attempts only — never an Anthropic call (see
 * ../generation/rewriter.ts, which is only ever invoked once the returned
 * report's `finalStatus` is "PASS"). The freshness policy is never relaxed
 * between attempts; only the query breadth and result count change.
 */
export async function retrieveValidatedSourcePack(input: RetrieveSourcesInput): Promise<SourceRetrievalReport> {
  const providers = input.providers ?? defaultProviders();
  const attempts: RetrievalAttemptLog[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIEVAL_ATTEMPTS; attempt++) {
    const query = queryForAttempt(input.topic, input.keywords, attempt);
    const limit = 15 + attempt * 10; // ask for more candidates on later attempts
    const providerErrors: Partial<Record<SourceProviderName, string>> = {};

    const candidateLists = await Promise.all(
      providers.map(async (provider) => {
        if (!provider.isConfigured()) {
          providerErrors[provider.name] = "not_configured";
          return [];
        }
        const result = await provider.search({ query, language: input.language, country: input.country, limit });
        if (result.error) providerErrors[provider.name] = result.error;
        return result.sources;
      })
    );

    const candidates = candidateLists.flat();
    const pack = buildSourcePack({
      topic: input.topic,
      keywords: input.keywords,
      freshnessPolicy: input.freshnessPolicy,
      candidates,
      now: input.now,
    });

    attempts.push({
      attempt,
      query,
      providersQueried: providers.map((p) => p.name),
      providerErrors,
      candidatesRetrieved: candidates.length,
      candidatesApproved: pack.sources.length,
      result: pack.status,
    });

    if (pack.status === "PASS") {
      return {
        requestId: input.requestId,
        topic: input.topic,
        freshnessPolicy: input.freshnessPolicy,
        attempts,
        finalStatus: "PASS",
        sourcePack: pack,
      };
    }
  }

  return {
    requestId: input.requestId,
    topic: input.topic,
    freshnessPolicy: input.freshnessPolicy,
    attempts,
    finalStatus: "FAIL",
    sourcePack: null,
  };
}
