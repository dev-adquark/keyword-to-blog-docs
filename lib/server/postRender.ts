import "server-only";
import type { SEOPostV1, GenerateRequestV1 } from "@/lib/types";

/**
 * Canonical rendering + post-generation constraint enforcement for a
 * generated post. Single source of truth used by both the synchronous
 * /v1/generate route and the async job processor — these must never drift.
 * Content length/word count is never targeted, validated, or truncated —
 * content publishes at whatever length the model naturally produces,
 * regardless of `constraints.maxWords`/`minWords` (kept on the request type
 * only for the separate, unrelated per-plan billing cap — see
 * app/api/v1/generate/route.ts).
 */

/** Canonical word count — the ONE function used for metering, constraint
 * checks, and quality-report word counts alike, so they can never drift
 * against each other. Counts every field that's actually published: each
 * section's body text and callout text, the conclusion, and every FAQ
 * question/answer. Deliberately excludes the title/headings/meta
 * description — those aren't part of an article's requested word-count
 * target in normal SEO practice. Must be called on the FINAL post — after
 * section-limit enforcement, link/citation stripping, and any other
 * post-render transform — never on a draft that's about to be truncated
 * further, or the count won't reflect what's actually returned. */
export function countWords(post: SEOPostV1): number {
  const texts: string[] = [];
  for (const s of post.sections) {
    if (s.contentMarkdown) texts.push(s.contentMarkdown);
    if (s.callout?.text) texts.push(s.callout.text);
  }
  if (post.conclusion) texts.push(post.conclusion);
  for (const f of post.faqs ?? []) {
    texts.push(f.question, f.answer);
  }
  return texts.reduce((sum, t) => sum + t.split(/\s+/).filter(Boolean).length, 0);
}

const MARKDOWN_LINK_PATTERN = /\[([^\]]*)\]\((?:https?:\/\/|mailto:)[^\s)]+\)/gi;
const HTML_ANCHOR_PATTERN = /<a\b[^>]*>([\s\S]*?)<\/a>/gi;
const RAW_URL_PATTERN = /\bhttps?:\/\/\S+/gi;
const WWW_PATTERN = /\bwww\.\S+/gi;
const CITATION_BRACKET_PATTERN = /\[\d+\]/g;
const SOURCE_ATTRIBUTION_PATTERN = /\((?:source|sources|via|credit|citation)s?:?[^)]*\)/gi;
/** A heading that IS (not merely mentions) a sources/references section. */
const SOURCES_HEADING_PATTERN = /^(sources?|references?|citations?|further reading|works cited)\s*:?$/i;

/**
 * Removes any URL, markdown link, HTML anchor, citation bracket, or
 * "(Source: ...)"-style attribution from a string, keeping the surrounding
 * prose intact (a markdown link's label text and an `<a>` tag's inner text
 * are both preserved — only the link mechanics are stripped). This is the
 * final deterministic safety layer: `post.sources` (the internal
 * citation-tracking/validation array — see citationIntegrity.ts) is a
 * completely separate thing and is never touched by this function. The
 * PUBLISHED content must never contain a source URL or link under any
 * circumstances, regardless of what the model was instructed to do.
 */
export function stripLinksAndCitations(text: string): string {
  return text
    .replace(HTML_ANCHOR_PATTERN, "$1")
    .replace(MARKDOWN_LINK_PATTERN, "$1")
    .replace(SOURCE_ATTRIBUTION_PATTERN, "")
    .replace(CITATION_BRACKET_PATTERN, "")
    .replace(RAW_URL_PATTERN, "")
    .replace(WWW_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
}

/**
 * Strips every link/URL/citation from every text field of a post, AND
 * removes any section (or outline.h2 entry) that is itself a "Sources"/
 * "References"-style section. Applied unconditionally to every generated
 * post — evergreen and source-grounded alike — as the last step before a
 * post is returned or persisted, so `post` and everything rendered from it
 * (`renderMarkdown`/`renderHtml`) can never contain a source link even if
 * the model didn't follow its instructions. `post.sources` itself is
 * deliberately left untouched — it's internal metadata, not content.
 */
export function stripSourceContent(post: SEOPostV1): SEOPostV1 {
  const sections = post.sections
    .filter((s) => !(s.heading && SOURCES_HEADING_PATTERN.test(s.heading.trim())))
    .map((s) => ({
      ...s,
      heading: s.heading ? stripLinksAndCitations(s.heading) : s.heading,
      contentMarkdown: s.contentMarkdown ? stripLinksAndCitations(s.contentMarkdown) : s.contentMarkdown,
      callout: s.callout ? { ...s.callout, text: stripLinksAndCitations(s.callout.text) } : s.callout,
    }));

  return {
    ...post,
    title: stripLinksAndCitations(post.title),
    meta: { ...post.meta, description: stripLinksAndCitations(post.meta.description) },
    outline: {
      ...post.outline,
      h1: stripLinksAndCitations(post.outline.h1),
      h2: post.outline.h2.filter((h) => !SOURCES_HEADING_PATTERN.test(h.trim())).map(stripLinksAndCitations),
    },
    sections,
    faqs: post.faqs?.map((f) => ({
      question: stripLinksAndCitations(f.question),
      answer: stripLinksAndCitations(f.answer),
    })),
    conclusion: stripLinksAndCitations(post.conclusion),
  };
}

/**
 * Deterministically enforces `maxSections` by truncating (no extra AI
 * call — a retry would double the API cost for a structural constraint we
 * can safely satisfy ourselves). This is a structural constraint only —
 * content length/word count is no longer targeted or validated at all (see
 * the module comment above): content publishes at whatever length the
 * model naturally produces.
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
 * `<`/`>`/`"` can never reach the output as real markup. Deliberately has
 * NO markdown-link-to-`<a>` conversion — published content must never
 * contain a link at all (see stripLinksAndCitations, which already runs on
 * every post before this ever sees it), so this never re-introduces one. */
function inlineToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${inlineToHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Both render functions strip links/citations themselves (not just relying
 * on the pipeline having already called stripSourceContent on `post`) —
 * this is the true final safety layer: rendered output is guaranteed
 * link-free regardless of what post object is passed in.
 */
export function renderMarkdown(rawPost: SEOPostV1): string {
  const post = stripSourceContent(rawPost);
  const parts = [`# ${post.outline.h1}`];
  for (const s of post.sections) {
    // `post.conclusion` is the single canonical closing text — a
    // `type: "conclusion"` section exists for structural/heading purposes
    // only. Rendering both here is exactly the duplicate-conclusion bug:
    // never render a conclusion-type section's own prose inline.
    if (s.type === "conclusion") continue;
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
  // post.sources is internal citation-tracking/validation metadata (see
  // citationIntegrity.ts) — it is NEVER rendered into published content.
  // The published article must contain zero source links/URLs.
  parts.push(post.conclusion);
  return parts.join("\n\n");
}

export function renderHtml(rawPost: SEOPostV1): string {
  const post = stripSourceContent(rawPost);
  const parts = [`<h1>${escapeHtml(post.outline.h1)}</h1>`];
  for (const s of post.sections) {
    // See renderMarkdown's comment — `post.conclusion` is the sole
    // canonical closing text; never also render a conclusion-type section's
    // own content inline, or the conclusion appears twice.
    if (s.type === "conclusion") continue;
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
  // post.sources is internal citation-tracking/validation metadata (see
  // citationIntegrity.ts) — it is NEVER rendered into published content.
  // The published article must contain zero source links/URLs.
  parts.push(paragraphsToHtml(post.conclusion));
  return parts.join("\n");
}
