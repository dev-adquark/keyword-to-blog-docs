import "server-only";
import type { FailedCheck, SEOPostV1, SourcePack } from "@/lib/types";

export interface CitationIntegrityResult {
  failedChecks: FailedCheck[];
  warnings: string[];
}

/**
 * The only new "freshness" check for source-grounded content: does the
 * rewritten post's `sources` field trace back exactly to the locked source
 * pack it was generated from? This is what catches Anthropic citing a URL
 * it wasn't given (a fabricated or memory-recalled citation) — the one
 * failure mode instruction-following alone can't guarantee against. Never
 * fixed automatically: a fabricated citation is a blocking failure that
 * fails the whole request closed (see sourceGroundedPipeline.ts — there is
 * no repair call in this pipeline).
 */
export function evaluateCitationIntegrity(post: SEOPostV1, pack: SourcePack): CitationIntegrityResult {
  const approvedUrls = new Set(pack.sources.map((s) => s.url));
  const postedSources = post.sources ?? [];

  if (postedSources.length === 0) {
    return {
      failedChecks: [
        {
          code: "MISSING_SOURCE_ATTRIBUTION",
          severity: "blocking",
          message:
            "The rewritten post did not cite any of the validated source pack's articles, even though it was generated from real, dated evidence.",
        },
      ],
      warnings: [],
    };
  }

  const fabricated = postedSources.filter((s) => !approvedUrls.has(s.url));
  if (fabricated.length > 0) {
    return {
      failedChecks: [
        {
          code: "FABRICATED_CITATION",
          severity: "blocking",
          message: `The post cites ${fabricated.length} URL(s) that are not present in the validated source pack — every citation must trace back to an approved, retrieved source: ${fabricated
            .map((f) => f.url)
            .join(", ")}`,
        },
      ],
      warnings: [],
    };
  }

  return { failedChecks: [], warnings: [] };
}
