import "server-only";
import type { ContentBrief, GenerateRequestV1 } from "@/lib/types";

/**
 * Builds a search-intent-aware brief from the request itself — deterministic
 * and heuristic, not a separate model call (an LLM call here would add
 * latency/cost for something the request fields already tell us — see
 * "avoid unnecessary model calls" in the pipeline's performance principles).
 */

const COMMERCIAL_SIGNALS = ["best", "top", "vs", "versus", "review", "buy", "price", "pricing", "cheap", "deal"];
const TRANSACTIONAL_SIGNALS = ["buy", "order", "discount", "coupon", "for sale", "purchase"];
const NAVIGATIONAL_SIGNALS = ["login", "sign in", "official site", "download"];

function detectSearchIntent(keywords: string[], topic?: string): ContentBrief["searchIntent"] {
  const haystack = [...keywords, topic ?? ""].join(" ").toLowerCase();
  if (TRANSACTIONAL_SIGNALS.some((s) => haystack.includes(s))) return "transactional";
  if (NAVIGATIONAL_SIGNALS.some((s) => haystack.includes(s))) return "navigational";
  if (COMMERCIAL_SIGNALS.some((s) => haystack.includes(s))) return "commercial";
  return "informational";
}

function deriveFaqTopics(primaryKeyword: string, searchIntent: ContentBrief["searchIntent"]): string[] {
  const base = [
    `What is ${primaryKeyword}?`,
    `How does ${primaryKeyword} work?`,
    `Why does ${primaryKeyword} matter?`,
  ];
  if (searchIntent === "commercial" || searchIntent === "transactional") {
    base.push(`How much does ${primaryKeyword} cost?`, `What are the best options for ${primaryKeyword}?`);
  }
  return base;
}

export function buildContentBrief(request: GenerateRequestV1): ContentBrief {
  const primaryKeyword = request.topic?.trim() || request.keywords[0] || "";
  const relatedKeywords = request.keywords.filter((k) => k.toLowerCase() !== primaryKeyword.toLowerCase());
  const searchIntent = detectSearchIntent(request.keywords, request.topic);

  const suggestedSections = [
    "A clear, non-generic introduction that states what the reader will get",
    ...(searchIntent === "commercial" || searchIntent === "transactional"
      ? ["Key criteria or comparison points", "Concrete recommendations with reasoning"]
      : ["Core concepts explained with concrete detail", "Practical guidance or steps"]),
    "Common pitfalls or edge cases",
    ...(request.constraints.includeFAQs ? ["FAQs answering real reader questions"] : []),
    "A conclusion that adds a genuinely new takeaway, not a summary restatement",
  ];

  return {
    primaryKeyword,
    relatedKeywords,
    searchIntent,
    audience: request.targetAudience,
    language: request.language,
    region: request.region,
    topic: request.topic || primaryKeyword,
    requiredConcepts: relatedKeywords,
    suggestedSections,
    faqTopics: request.constraints.includeFAQs ? deriveFaqTopics(primaryKeyword, searchIntent) : [],
  };
}
