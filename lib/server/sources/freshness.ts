import "server-only";
import type { FreshnessPolicy, NormalizedSource } from "@/lib/types";

/** The single source of truth for "today" across the whole source-retrieval
 * layer — see REQUIREMENTS "using the configured application timezone". */
export const APPLICATION_TIMEZONE = "UTC";

const dateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APPLICATION_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** True only when `publishedAt` can be reliably parsed and satisfies the
 * given policy. A missing or unparseable timestamp is ALWAYS rejected —
 * never guessed, never defaulted to "now" or "recent". A future-dated
 * timestamp (beyond a small clock-skew tolerance) is also rejected, since
 * that can only mean a parsing error or provider bug, never real evidence. */
export function isWithinFreshnessPolicy(
  source: NormalizedSource,
  policy: FreshnessPolicy,
  now: Date = new Date()
): boolean {
  if (policy === "NO_FRESHNESS_REQUIREMENT") return true;
  if (!source.publishedAt) return false;

  const published = new Date(source.publishedAt);
  if (Number.isNaN(published.getTime())) return false;

  const CLOCK_SKEW_TOLERANCE_MS = 5 * 60_000;
  if (published.getTime() > now.getTime() + CLOCK_SKEW_TOLERANCE_MS) return false;

  switch (policy) {
    case "TODAY_ONLY":
      // Compare calendar date in the application timezone — never via
      // toISOString()/local Date components, which can silently shift an
      // unqualified timestamp onto the wrong calendar day.
      return dateFormatter.format(published) === dateFormatter.format(now);
    case "LAST_24_HOURS":
      return now.getTime() - published.getTime() <= 24 * 60 * 60_000;
    case "LAST_48_HOURS":
      return now.getTime() - published.getTime() <= 48 * 60 * 60_000;
    case "LAST_7_DAYS":
      return now.getTime() - published.getTime() <= 7 * 24 * 60 * 60_000;
  }
}
