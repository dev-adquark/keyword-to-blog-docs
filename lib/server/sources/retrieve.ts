import "server-only";
import type { FreshnessPolicy, RetrievalAttemptLog, SourceProviderName, SourceRetrievalReport } from "@/lib/types";
import type { SourceProvider } from "./providers/provider";
import { CurrentsProvider } from "./providers/currents";
import { NewsDataProvider } from "./providers/newsdata";
import { GdeltProvider } from "./providers/gdelt";
import { NewsApiOrgProvider } from "./providers/newsapiOrg";
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
  return [new CurrentsProvider(), new NewsDataProvider(), new GdeltProvider(), new NewsApiOrgProvider()];
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

/** Provider-side date filter matching the freshness policy — lets a
 * provider that supports it (see SourceSearchParams.publishedAfter) do
 * some of the freshness filtering itself, reducing wasted candidates. This
 * is purely an efficiency hint: the real, authoritative freshness check
 * still runs deterministically afterward in ./sourcePack.ts regardless of
 * whether a given provider honors this parameter at all. */
function publishedAfterForPolicy(policy: FreshnessPolicy, now: Date): string | undefined {
  const days = policy === "LAST_7_DAYS" ? 7 : policy === "LAST_48_HOURS" ? 2 : policy === "LAST_24_HOURS" ? 1 : undefined;
  if (days === undefined) return undefined;
  return new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

/**
 * Retrieve → normalize → validate, up to MAX_RETRIEVAL_ATTEMPTS times.
 * These are source-retrieval attempts only — never an Anthropic call (see
 * ../generation/rewriter.ts, which is only ever invoked once the returned
 * report's `finalStatus` is "PASS"). The freshness policy is never relaxed
 * between attempts; only the query breadth and result count change.
 *
 * The returned report's `sourcePack` always holds the MOST RECENT attempt's
 * built pack — including on total failure — so its `failureReasons`,
 * `rejectedSources`, etc. are never silently discarded. A caller must check
 * `finalStatus`/`sourcePack.status` to know PASS vs FAIL; `sourcePack`
 * being present is not itself a success signal.
 */
export async function retrieveValidatedSourcePack(input: RetrieveSourcesInput): Promise<SourceRetrievalReport> {
  const providers = input.providers ?? defaultProviders();
  const attempts: RetrievalAttemptLog[] = [];
  const now = input.now ?? new Date();
  const publishedAfter = publishedAfterForPolicy(input.freshnessPolicy, now);
  let lastPack = null as ReturnType<typeof buildSourcePack> | null;

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
        try {
          const result = await provider.search({ query, language: input.language, country: input.country, limit, publishedAfter });
          if (result.error) providerErrors[provider.name] = result.error;
          return result.sources;
        } catch (err) {
          // Defense in depth: a provider adapter is expected to catch its
          // own errors and return { sources: [], error }, but an
          // unexpected thrown exception here must still never abort the
          // other providers or the whole retrieval attempt.
          providerErrors[provider.name] = err instanceof Error ? err.message : "unexpected_provider_exception";
          return [];
        }
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
    lastPack = pack;

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
    // The last attempt's pack (status: "FAIL") — never discarded — carries
    // the real, specific failureReasons/rejectedSources callers need to
    // explain why. See SourceValidationFailedError in
    // ../content-quality/sourceGroundedPipeline.ts.
    sourcePack: lastPack,
  };
}
