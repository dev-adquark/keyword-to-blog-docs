import "server-only";
import type { FailedCheck, SEOPostV1 } from "@/lib/types";

export interface NoPublishedLinksResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

const URL_PATTERN = /https?:\/\/\S+/i;
const WWW_PATTERN = /\bwww\.\S+/i;
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\((?:https?:\/\/|mailto:)[^\s)]+\)/i;
const HTML_ANCHOR_PATTERN = /<a\b[^>]*>/i;
const CITATION_BRACKET_PATTERN = /\[\d+\]/;
const SOURCE_ATTRIBUTION_PATTERN = /\((?:source|sources|via|credit|citation)s?:?[^)]*\)/i;
const SOURCES_HEADING_PATTERN = /^(sources?|references?|citations?|further reading|works cited)\s*:?$/i;

function findLinkLikeMatch(text: string): string | null {
  const urlMatch = text.match(URL_PATTERN);
  if (urlMatch) return urlMatch[0];
  const wwwMatch = text.match(WWW_PATTERN);
  if (wwwMatch) return wwwMatch[0];
  const mdMatch = text.match(MARKDOWN_LINK_PATTERN);
  if (mdMatch) return mdMatch[0];
  const anchorMatch = text.match(HTML_ANCHOR_PATTERN);
  if (anchorMatch) return anchorMatch[0];
  const citationMatch = text.match(CITATION_BRACKET_PATTERN);
  if (citationMatch) return citationMatch[0];
  const attributionMatch = text.match(SOURCE_ATTRIBUTION_PATTERN);
  if (attributionMatch) return attributionMatch[0];
  return null;
}

/**
 * Hard backstop, run AFTER lib/server/postRender.ts's stripSourceContent
 * has already unconditionally run on every post. In normal operation this
 * should never find anything — it exists to catch a gap in the stripping
 * regexes (an unusual link format, a future field the stripper doesn't yet
 * cover) and fail the request closed rather than silently publish a source
 * link. Never checks `post.sources` itself — that's internal citation
 * metadata (see citationIntegrity.ts), not published content.
 */
export function evaluateNoPublishedLinks(post: SEOPostV1): NoPublishedLinksResult {
  const failed: FailedCheck[] = [];

  const fields: Array<{ label: string; text: string | undefined }> = [
    { label: "title", text: post.title },
    { label: "meta.description", text: post.meta.description },
    { label: "outline.h1", text: post.outline.h1 },
    ...post.outline.h2.map((h, i) => ({ label: `outline.h2[${i}]`, text: h })),
    ...post.sections.flatMap((s, i) => [
      { label: `sections[${i}].heading`, text: s.heading },
      { label: `sections[${i}].contentMarkdown`, text: s.contentMarkdown },
      { label: `sections[${i}].callout.text`, text: s.callout?.text },
    ]),
    ...(post.faqs ?? []).flatMap((f, i) => [
      { label: `faqs[${i}].question`, text: f.question },
      { label: `faqs[${i}].answer`, text: f.answer },
    ]),
    { label: "conclusion", text: post.conclusion },
  ];

  for (const { label, text } of fields) {
    if (!text) continue;
    const match = findLinkLikeMatch(text);
    if (match) {
      failed.push({
        code: "SOURCE_LINK_IN_CONTENT",
        severity: "blocking",
        message: `Published content must never contain a source link/URL — found "${match.slice(0, 80)}" in ${label}.`,
        section: label,
      });
    }
  }

  for (const s of post.sections) {
    if (s.heading && SOURCES_HEADING_PATTERN.test(s.heading.trim())) {
      failed.push({
        code: "SOURCE_LINK_IN_CONTENT",
        severity: "blocking",
        message: `Published content must never contain a "Sources"/"References" section — found heading "${s.heading}".`,
        section: s.heading,
      });
    }
  }

  const score = Math.max(0, 100 - failed.length * 50);
  return { score, failedChecks: failed, warnings: [] };
}
