import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { splitSentences } from "./textStats";

/**
 * Local, deterministic, zero-AI-call fixes for mechanical problems —
 * applied before ever spending the one allowed repair call on something
 * that pure code can fix for free. Applied for EVERY matching failedCheck
 * code present, regardless of severity (blocking or warning) — these are
 * free, so there's no reason to only fix the blocking ones; a genuinely
 * "publish-ready" article shouldn't have a leftover cosmetic issue either
 * (see the pipeline's "safest available fallback correction" step).
 *
 * Never touches prose depth/originality/writing-style problems — those
 * require real rewriting and go through the single AI repair call instead
 * (see repairPatch.ts / engine.ts).
 */

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fixSlug(post: SEOPostV1): SEOPostV1 {
  const words = slugify(post.title).split("-").filter(Boolean).slice(0, 8);
  const slug = words.join("-") || slugify(post.meta.primaryKeyword) || "post";
  return { ...post, slugSuggestion: slug };
}

function stripYearFromTitle(title: string): string {
  return title
    .replace(/\s*\b(?:for|in|of)\s+(?:19|20)\d{2}\b/gi, "")
    .replace(/\s*\b(?:19|20)\d{2}\b/g, "")
    .replace(/\s*[:\-–—]\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const CLICKBAIT_PHRASES = /\b(?:you won'?t believe|this one trick|shocking)\b/gi;

function deshoutTitle(title: string): string {
  return title
    .replace(/!{2,}/g, "!")
    .replace(/\b[A-Z]{4,}\b/g, (w) => capitalize(w.toLowerCase()))
    .replace(CLICKBAIT_PHRASES, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function lengthenShortTitle(title: string, brief: ContentBrief): string {
  const topic = (brief.topic || brief.primaryKeyword || "").trim();
  if (!topic || title.toLowerCase().includes(topic.toLowerCase())) return title;
  return `${title}: ${capitalize(topic)}`;
}

function composeMetaDescription(post: SEOPostV1, brief: ContentBrief): string {
  const introText =
    post.sections.find((s) => s.type === "introduction")?.contentMarkdown ??
    post.sections[0]?.contentMarkdown ??
    "";
  let description = (splitSentences(introText)[0] ?? "").trim();
  const keyword = (brief.primaryKeyword || post.meta.primaryKeyword || "").trim();

  if (keyword && !description.toLowerCase().includes(keyword.toLowerCase())) {
    description = `${capitalize(keyword)}: ${description}`;
  }
  if (description.length < 50) {
    description = `${description} A practical guide to ${keyword || brief.topic}.`.trim();
  }
  if (description.length > 160) {
    description = `${description.slice(0, 157).trimEnd()}...`;
  }
  return description || post.meta.description;
}

function dedupeSectionHeadings(post: SEOPostV1): SEOPostV1 {
  const seen = new Map<string, number>();
  const sections = post.sections.map((s) => {
    if (!s.heading) return s;
    const key = s.heading.trim().toLowerCase();
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count === 1 ? s : { ...s, heading: `${s.heading} (${count})` };
  });
  return { ...post, sections };
}

function fixStructure(post: SEOPostV1): SEOPostV1 {
  const introIndices = post.sections
    .map((s, i) => (s.type === "introduction" ? i : -1))
    .filter((i) => i >= 0);
  const extraIntroIndices = new Set(introIndices.slice(1));
  const sections = post.sections.map((s, i) => (extraIntroIndices.has(i) ? { ...s, type: "body" as const } : s));

  const seenH2 = new Map<string, number>();
  const h2 = post.outline.h2.map((h) => {
    const key = h.trim().toLowerCase();
    const count = (seenH2.get(key) ?? 0) + 1;
    seenH2.set(key, count);
    return count === 1 ? h : `${h} (${count})`;
  });

  return { ...post, sections, outline: { ...post.outline, h2 } };
}

/**
 * Fixes the duplicate-conclusion bug at the source: `post.conclusion` is the
 * single canonical closing text, so any `type: "conclusion"` section is
 * redundant. Never just discards real content — if a conclusion-type
 * section's prose is more substantial than the current `post.conclusion`,
 * it's promoted to become the new canonical conclusion; either way, the
 * redundant section itself is removed from `sections[]`.
 */
function dedupeConclusion(post: SEOPostV1): SEOPostV1 {
  const conclusionTexts = post.sections
    .filter((s) => s.type === "conclusion")
    .map((s) => s.contentMarkdown)
    .filter((text): text is string => Boolean(text && text.trim().length > 0));

  if (conclusionTexts.length === 0) return post;

  const longest = [...conclusionTexts].sort((a, b) => b.length - a.length)[0]!;
  const conclusion = longest.length > post.conclusion.length ? longest : post.conclusion;
  const sections = post.sections.filter((s) => s.type !== "conclusion");

  return { ...post, conclusion, sections };
}

/** Drops FAQ entries that fail basic quality bars (duplicate question, not
 * phrased as a question, or an answer too thin to be useful) — removing bad
 * content is a safe mechanical fix; rewriting it is not. */
function removeWeakFaqs(post: SEOPostV1): SEOPostV1 {
  if (!post.faqs || post.faqs.length === 0) return post;
  const seenQuestions = new Set<string>();
  const faqs = post.faqs.filter((faq) => {
    const key = faq.question.trim().toLowerCase();
    if (seenQuestions.has(key)) return false;
    seenQuestions.add(key);
    if (!/[?？]\s*$/.test(faq.question.trim())) return false;
    if (faq.answer.trim().length < 20) return false;
    return true;
  });
  return { ...post, faqs };
}

function fixKeywordStuffedHeadings(post: SEOPostV1, brief: ContentBrief): SEOPostV1 {
  const keyword = brief.primaryKeyword?.trim().toLowerCase();
  if (!keyword) return post;
  const replacement = `Overview of ${capitalize(brief.topic || brief.primaryKeyword)}`;
  const h2 = post.outline.h2.map((h) => (h.trim().toLowerCase() === keyword ? replacement : h));
  const sections = post.sections.map((s) =>
    s.heading && s.heading.trim().toLowerCase() === keyword ? { ...s, heading: replacement } : s
  );
  return { ...post, outline: { ...post.outline, h2 }, sections };
}

type Fixer = (post: SEOPostV1, brief: ContentBrief) => SEOPostV1;

const FIXERS: Record<string, Fixer> = {
  INVALID_SLUG_FORMAT: fixSlug,
  SLUG_TOO_LONG: fixSlug,
  UNNECESSARY_YEAR_IN_TITLE: (post) => ({ ...post, title: stripYearFromTitle(post.title) || post.title }),
  CLICKBAIT_TITLE: (post) => ({ ...post, title: deshoutTitle(post.title) || post.title }),
  TITLE_TOO_SHORT: (post, brief) => ({ ...post, title: lengthenShortTitle(post.title, brief) }),
  META_DESCRIPTION_TOO_SHORT: (post, brief) => ({
    ...post,
    meta: { ...post.meta, description: composeMetaDescription(post, brief) },
  }),
  GENERIC_META_DESCRIPTION: (post, brief) => ({
    ...post,
    meta: { ...post.meta, description: composeMetaDescription(post, brief) },
  }),
  DUPLICATE_HEADING: dedupeSectionHeadings,
  STRUCTURE_INVALID: fixStructure,
  DUPLICATE_CONCLUSION: dedupeConclusion,
  WEAK_FAQS: removeWeakFaqs,
  KEYWORD_STUFFED_HEADING: fixKeywordStuffedHeadings,
};

/** Every failedCheck code this module knows how to fix without an AI call. */
export const MECHANICALLY_FIXABLE_CODES: ReadonlySet<string> = new Set(Object.keys(FIXERS));

export interface AutoFixResult {
  post: SEOPostV1;
  appliedFixes: string[];
}

export function applyDeterministicFixes(
  post: SEOPostV1,
  failedChecks: FailedCheck[],
  brief: ContentBrief
): AutoFixResult {
  const codes = [...new Set(failedChecks.map((f) => f.code))];
  let fixed = post;
  const appliedFixes: string[] = [];

  for (const code of codes) {
    const fixer = FIXERS[code];
    if (!fixer) continue;
    fixed = fixer(fixed, brief);
    appliedFixes.push(code);
  }

  return { post: fixed, appliedFixes };
}
