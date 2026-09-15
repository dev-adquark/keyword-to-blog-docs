import "server-only";
import type { SEOPostV1, GenerateRequestV1 } from "@/lib/types";
import { ApiError } from "./apiErrors";

/**
 * Canonical rendering + post-generation constraint enforcement for a
 * generated post. Single source of truth used by both the synchronous
 * /v1/generate route and the async job processor — these must never drift.
 */

/** Canonical word count — the same source used for both metering and constraint checks. */
export function countWords(post: SEOPostV1): number {
  return post.sections.reduce(
    (sum, s) => sum + (s.contentMarkdown ?? "").split(/\s+/).filter(Boolean).length,
    0
  );
}

/**
 * Deterministically enforces `maxSections` by truncating (no extra AI
 * call — a retry would double the API cost for a structural constraint we
 * can safely satisfy ourselves). Word-count is checked separately via
 * `assertWordCountWithinTolerance` since prose can't be truncated safely.
 */
export function enforceSectionConstraint(
  post: SEOPostV1,
  constraints: GenerateRequestV1["constraints"]
): SEOPostV1 {
  if (!constraints.maxSections || post.sections.length <= constraints.maxSections) {
    return post;
  }
  return { ...post, sections: post.sections.slice(0, constraints.maxSections) };
}

/**
 * Word count is a soft prompt target, not something we can truncate without
 * mangling prose — so instead of silently returning content that blew past
 * the requested length, or spending a second AI call on a retry, we reject
 * outright once the model is egregiously (50%+) over budget. Reasonable
 * variance is allowed; only a clearly broken generation is rejected.
 */
export function assertWordCountWithinTolerance(
  words: number,
  constraints: GenerateRequestV1["constraints"]
): void {
  const overBudget = words > constraints.maxWords * 1.5;
  const underBudget = Boolean(constraints.minWords) && words < constraints.minWords! * 0.5;
  if (overBudget || underBudget) {
    throw new ApiError(
      "INTERNAL_ERROR",
      "Generated content did not meet the requested length constraints. Please try again."
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escapes first, then applies a small whitelist of markdown-style inline
 * formatting on the already-escaped text — safe by construction, since raw
 * `<`/`>`/`"` can never reach the output as real markup. */
function inlineToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      (_m, label: string, url: string) => `<a href="${escapeHtml(url)}" rel="noopener noreferrer">${label}</a>`
    );
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inlineToHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export function renderMarkdown(post: SEOPostV1): string {
  const parts = [`# ${post.outline.h1}`];
  for (const s of post.sections) {
    if (s.heading) parts.push(`## ${s.heading}`);
    if (s.contentMarkdown) parts.push(s.contentMarkdown);
    if (s.callout) parts.push(`> **${s.callout.label}:** ${s.callout.text}`);
  }
  if (post.faqs?.length) {
    parts.push("## Frequently asked questions");
    for (const faq of post.faqs) {
      parts.push(`**${faq.question}**\n\n${faq.answer}`);
    }
  }
  parts.push(post.conclusion);
  return parts.join("\n\n");
}

export function renderHtml(post: SEOPostV1): string {
  const parts = [`<h1>${escapeHtml(post.outline.h1)}</h1>`];
  for (const s of post.sections) {
    if (s.heading) parts.push(`<h2>${escapeHtml(s.heading)}</h2>`);
    if (s.contentMarkdown) parts.push(paragraphsToHtml(s.contentMarkdown));
    if (s.callout) {
      parts.push(
        `<blockquote><strong>${escapeHtml(s.callout.label)}:</strong> ${escapeHtml(s.callout.text)}</blockquote>`
      );
    }
  }
  if (post.faqs?.length) {
    parts.push("<h2>Frequently asked questions</h2>");
    for (const faq of post.faqs) {
      parts.push(`<h3>${escapeHtml(faq.question)}</h3>\n<p>${escapeHtml(faq.answer)}</p>`);
    }
  }
  parts.push(paragraphsToHtml(post.conclusion));
  return parts.join("\n");
}
