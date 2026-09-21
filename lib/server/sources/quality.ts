import "server-only";
import type { NormalizedSource } from "@/lib/types";

export interface QualityResult {
  passed: boolean;
  reason?: string;
}

const SPAM_TITLE_PATTERNS = [
  /\bclick here\b/i,
  /\byou won'?t believe\b/i,
  /\bnumber \d+ will (?:shock|surprise)\b/i,
  /^\s*\W*\s*$/, // only punctuation/whitespace
];

/** Basic, provider-agnostic quality gate — never assumes every provider is
 * equally reliable, but applies the same objective bar to all of them. */
export function evaluateSourceQuality(source: NormalizedSource): QualityResult {
  if (!isValidHttpUrl(source.url)) {
    return { passed: false, reason: "invalid or non-HTTP(S) URL" };
  }
  if (!source.title || source.title.trim().length < 8) {
    return { passed: false, reason: "missing or too-short title" };
  }
  if (!source.description && !source.content) {
    return { passed: false, reason: "no usable description or content" };
  }
  if (SPAM_TITLE_PATTERNS.some((p) => p.test(source.title))) {
    return { passed: false, reason: "title matches a spam/clickbait pattern" };
  }
  return { passed: true };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
