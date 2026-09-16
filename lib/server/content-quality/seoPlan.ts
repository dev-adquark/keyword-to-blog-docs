import "server-only";
import type { ContentBrief, GenerateRequestV1, SeoPlan } from "@/lib/types";

/**
 * Internal SEO guidance folded into the generation prompt (see
 * lib/server/generation/anthropic.ts's buildPrompt). Never returned to the
 * API consumer. Prioritizes search intent and usefulness over artificial
 * keyword density, per the product requirement.
 */
export function buildSeoPlan(request: GenerateRequestV1, brief: ContentBrief): SeoPlan {
  return {
    titleDirection: `Write a title that accurately reflects "${brief.topic}" for a ${brief.searchIntent} search intent. Include "${brief.primaryKeyword}" only if it reads naturally. Do not add a year unless the topic itself is inherently time-bound (e.g. an annual event) — most topics should have no year at all.`,
    metaDescriptionDirection: `One or two sentences, 120-160 characters, that describe the specific value of this article for a ${brief.searchIntent} searcher — no generic filler like "learn everything you need to know".`,
    h2Guidance: brief.suggestedSections,
    keywordPlacementNotes: `Use "${brief.primaryKeyword}"${brief.relatedKeywords.length ? ` and related terms (${brief.relatedKeywords.join(", ")})` : ""} naturally where they fit — never force a fixed count or density. Prioritize covering the underlying concepts over repeating exact phrases.`,
  };
}
