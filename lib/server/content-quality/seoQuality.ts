import "server-only";
import type { ContentBrief, FailedCheck, SEOPostV1 } from "@/lib/types";
import { jaccardSimilarity, collectSectionProse } from "./textStats";

/**
 * Consolidates title/meta description/slug/heading/FAQ validation — these
 * are the concrete, structural SEO checks (as distinct from keywordQuality.ts,
 * which is about keyword usage/coverage/stuffing).
 */
export interface SeoQualityResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

const YEAR_PATTERN = /\b(19|20)\d{2}\b/;
const CLICKBAIT_PATTERNS = [/!{2,}/, /\byou won'?t believe\b/i, /\bthis one trick\b/i, /\bshocking\b/i];

function validateTitle(post: SEOPostV1, brief: ContentBrief, failed: FailedCheck[], warnings: string[]): void {
  const title = post.title.trim();
  if (title.length < 10) {
    failed.push({ code: "TITLE_TOO_SHORT", severity: "blocking", message: "Title is too short to be descriptive." });
  }
  if (title.length > 70) {
    warnings.push(`Title is ${title.length} characters — likely to be truncated in search results (target ~70).`);
  }

  const yearMatch = title.match(YEAR_PATTERN);
  if (yearMatch) {
    const yearAlsoInTopic = brief.topic.includes(yearMatch[0]) || brief.primaryKeyword.includes(yearMatch[0]);
    if (!yearAlsoInTopic) {
      failed.push({
        code: "UNNECESSARY_YEAR_IN_TITLE",
        severity: "warning",
        message: `Title contains "${yearMatch[0]}" but the topic doesn't call for a year reference — this goes stale immediately.`,
      });
    }
  }

  if (CLICKBAIT_PATTERNS.some((p) => p.test(title))) {
    failed.push({ code: "CLICKBAIT_TITLE", severity: "warning", message: "Title uses clickbait-style phrasing." });
  }

  if (brief.primaryKeyword && post.outline.h2.length > 0) {
    const duplicateOfH2 = post.outline.h2.some((h) => h.trim().toLowerCase() === title.toLowerCase());
    if (duplicateOfH2) {
      warnings.push("Title is identical to one of the H2 headings.");
    }
  }
}

function validateMetaDescription(post: SEOPostV1, failed: FailedCheck[], warnings: string[]): void {
  const desc = post.meta.description.trim();
  if (desc.length < 50) {
    failed.push({
      code: "META_DESCRIPTION_TOO_SHORT",
      severity: "warning",
      message: `Meta description is ${desc.length} characters — likely too thin to be useful in search results.`,
    });
  }
  if (desc.length > 165) {
    warnings.push(`Meta description is ${desc.length} characters — will be truncated (target ~155-160).`);
  }
  if (/^(?:learn everything|discover everything|this article|in this post)/i.test(desc)) {
    failed.push({
      code: "GENERIC_META_DESCRIPTION",
      severity: "warning",
      message: "Meta description opens with a generic template phrase instead of describing the article's specific value.",
    });
  }
}

function validateSlug(post: SEOPostV1, failed: FailedCheck[]): void {
  const slug = post.slugSuggestion.trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    failed.push({
      code: "INVALID_SLUG_FORMAT",
      severity: "blocking",
      message: `Slug "${slug}" is not lowercase, hyphen-separated, URL-safe text.`,
    });
    return;
  }
  if (slug.includes("--")) {
    failed.push({ code: "INVALID_SLUG_FORMAT", severity: "warning", message: "Slug contains a doubled separator." });
  }
  if (slug.length > 75) {
    failed.push({ code: "SLUG_TOO_LONG", severity: "warning", message: `Slug is ${slug.length} characters — too long.` });
  }
}

/** Body sections need at least a little substance beyond just existing —
 * seoPostSchema already requires non-empty contentMarkdown OR a callout, but
 * "non-empty" and "substantive" aren't the same thing. */
function validateHeadingsHaveSubstance(post: SEOPostV1, failed: FailedCheck[]): void {
  for (const s of post.sections) {
    if (s.heading && s.contentMarkdown && s.contentMarkdown.trim().length < 40) {
      failed.push({
        code: "EMPTY_SECTION",
        severity: "blocking",
        message: `Section "${s.heading}" has a heading but almost no content beneath it.`,
        section: s.heading,
      });
    }
  }
}

function validateFaqs(post: SEOPostV1, failed: FailedCheck[], warnings: string[]): void {
  if (!post.faqs || post.faqs.length === 0) return;

  const bodyProse = collectSectionProse(post.sections).join(" ");
  const seenQuestions = new Set<string>();

  for (const faq of post.faqs) {
    const q = faq.question.trim();
    const key = q.toLowerCase();
    if (seenQuestions.has(key)) {
      failed.push({ code: "WEAK_FAQS", severity: "warning", message: `Duplicate FAQ question: "${q}".` });
      continue;
    }
    seenQuestions.add(key);

    if (!/[?？]\s*$/.test(q)) {
      failed.push({ code: "WEAK_FAQS", severity: "warning", message: `FAQ item doesn't read as a real question: "${q}".` });
    }
    if (faq.answer.trim().length < 20) {
      failed.push({ code: "WEAK_FAQS", severity: "warning", message: `FAQ answer for "${q}" is too thin to be useful.` });
    }
    if (bodyProse && jaccardSimilarity(faq.answer, bodyProse.slice(0, 500)) > 0.9) {
      warnings.push(`FAQ answer for "${q}" closely duplicates body content.`);
    }
  }
}

export function evaluateSeoQuality(post: SEOPostV1, brief: ContentBrief): SeoQualityResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  validateTitle(post, brief, failed, warnings);
  validateMetaDescription(post, failed, warnings);
  validateSlug(post, failed);
  validateHeadingsHaveSubstance(post, failed);
  validateFaqs(post, failed, warnings);

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const warningCount = failed.filter((f) => f.severity === "warning").length;
  const score = Math.max(0, 100 - blockingCount * 25 - warningCount * 8);

  return { score, failedChecks: failed, warnings };
}
