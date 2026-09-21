import type { ContentBrief, FailedCheck, GenerateRequestV1, RepairPatch, SEOPostV1, SeoPlan } from "@/lib/types";

export interface GenerationContext {
  brief?: ContentBrief;
  plan?: SeoPlan;
}

export interface RepairRequest {
  request: GenerateRequestV1;
  post: SEOPostV1;
  /** Only the still-blocking, non-mechanically-fixable failures — the
   * targeted problem list the repair call must address. */
  failedChecks: FailedCheck[];
  context?: GenerationContext;
}

/**
 * The evergreen ("standard") generate/repair provider — used only for
 * non-freshness-sensitive requests. Never offered a web_search/research
 * tool: Anthropic is not the source of truth for what's current (see
 * lib/server/sources/ and lib/server/generation/rewriter.ts, which handle
 * freshness-sensitive requests through a completely separate,
 * source-pack-first pipeline — see lib/server/content-quality/engine.ts).
 */
export interface AIProvider {
  generate(request: GenerateRequestV1, context?: GenerationContext): Promise<SEOPostV1>;
  /**
   * ONE targeted repair call — returns a partial patch of only the
   * fields/sections that needed to change, never a full re-generation. See
   * lib/server/content-quality/engine.ts for the 2-call-per-request budget
   * this exists to support.
   */
  repair(params: RepairRequest): Promise<RepairPatch>;
}
