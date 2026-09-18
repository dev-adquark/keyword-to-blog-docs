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

/** `groundedInSearch` is true only when the call actually returned at least
 * one non-empty live web_search result — never merely because the tool was
 * offered. `groundedInTodaySource` is the stricter bar freshness.ts actually
 * gates on: true only if one of those results is verified (via its
 * page_age) as published TODAY — a search that only turned up yesterday's or
 * older sources still leaves this false, per the strict "never present
 * yesterday-or-older information as current" policy (see
 * lib/server/content-quality/freshness.ts). */
export interface GenerateResult {
  post: SEOPostV1;
  groundedInSearch: boolean;
  groundedInTodaySource: boolean;
}

export interface RepairResult {
  patch: RepairPatch;
  groundedInSearch: boolean;
  groundedInTodaySource: boolean;
}

export interface AIProvider {
  generate(request: GenerateRequestV1, context?: GenerationContext): Promise<GenerateResult>;
  /**
   * ONE targeted repair call — returns a partial patch of only the
   * fields/sections that needed to change, never a full re-generation. See
   * lib/server/content-quality/engine.ts for the 2-call-per-request budget
   * this exists to support.
   */
  repair(params: RepairRequest): Promise<RepairResult>;
}
