import "server-only";
import type { FailedCheck, SEOPostV1, SourcePack } from "@/lib/types";
import { collectSectionProse } from "./textStats";

export interface SourceOriginalityResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

/**
 * Detects the article copying or closely paraphrasing the SourcePack's raw
 * evidence text, rather than synthesizing it into fresh, original prose.
 * This is a DIFFERENT concern from originality.ts (which only looks for
 * internal duplication within the article itself) — this compares the
 * article against the real source material it was generated from.
 *
 * Deterministic, no NLP/NER model available: overlap is measured via
 * word-level shingles (contiguous N-word windows) shared verbatim between
 * article and source text. A shingle counts as "unavoidable overlap" (a
 * name, product, official title, or number/date) rather than copied
 * phrasing when it's overwhelmingly made of capitalized/numeric tokens
 * with few ordinary connecting words — "Apple Inc. reported $89.5 billion"
 * is exempt; "the company said in a statement that the change would" is
 * not. This is a heuristic, not true proper-noun detection, and is
 * deliberately conservative (favors under- over over-flagging normal
 * factual grounding).
 */

const SHINGLE_SIZE = 8;
const MAX_OVERLAP_RATIO = 0.15;
/** 5+ consecutive matched shingles ≈ a verbatim run of ~12+ words — long
 * enough to be a real copied sentence fragment, not coincidental overlap. */
const LONG_RUN_MIN_CONSECUTIVE_SHINGLES = 5;
/** A shingle is exempt when at least this fraction of its words are
 * proper-noun-like (capitalized) or numeric. */
const EXEMPT_SPECIFIC_RATIO = 0.7;

const GENERIC_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with", "about", "as", "by",
  "is", "are", "was", "were", "be", "been", "being", "has", "have", "had", "will", "would", "could", "should",
  "this", "that", "these", "those", "it", "its", "from", "into", "over", "said", "says", "according",
  "reported", "announced", "stated", "noted", "added", "told", "also", "not", "no", "than", "then",
  "more", "most", "which", "who", "what", "when", "where", "why", "how", "their", "his", "her", "our", "your",
]);

function rawWordTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
}

function isSpecificToken(word: string): boolean {
  return /^\d/.test(word) || /^[A-Z]/.test(word);
}

function isExemptShingle(shingle: string[]): boolean {
  const genericCount = shingle.filter((w) => GENERIC_WORDS.has(w.toLowerCase())).length;
  if (genericCount === 0) return true;
  const specificCount = shingle.filter(isSpecificToken).length;
  return specificCount / shingle.length >= EXEMPT_SPECIFIC_RATIO;
}

function shingles(words: string[], size: number): string[][] {
  if (words.length < size) return [];
  const result: string[][] = [];
  for (let i = 0; i <= words.length - size; i++) result.push(words.slice(i, i + size));
  return result;
}

function shingleKey(shingle: string[]): string {
  return shingle.map((w) => w.toLowerCase()).join(" ");
}

export function evaluateSourceOriginality(post: SEOPostV1, pack: SourcePack): SourceOriginalityResult {
  const articleText = [post.title, ...collectSectionProse(post.sections), post.conclusion, ...(post.faqs ?? []).map((f) => f.answer)].join(
    " "
  );
  const articleShingles = shingles(rawWordTokens(articleText), SHINGLE_SIZE);

  if (articleShingles.length === 0) {
    return { score: 100, failedChecks: [], warnings: [] };
  }

  // Map each non-exempt source shingle to the source index it came from.
  const sourceShingleMap = new Map<string, number>();
  pack.sources.forEach((source, index) => {
    const text = [source.title, source.description ?? "", source.content ?? ""].join(" ");
    for (const shingle of shingles(rawWordTokens(text), SHINGLE_SIZE)) {
      if (isExemptShingle(shingle)) continue;
      const key = shingleKey(shingle);
      if (!sourceShingleMap.has(key)) sourceShingleMap.set(key, index);
    }
  });

  const matchedFlags: Array<{ matched: boolean; shingle: string[]; sourceIndex: number | null }> = articleShingles.map((shingle) => {
    if (isExemptShingle(shingle)) return { matched: false, shingle, sourceIndex: null };
    const sourceIndex = sourceShingleMap.get(shingleKey(shingle));
    return { matched: sourceIndex !== undefined, shingle, sourceIndex: sourceIndex ?? null };
  });

  const overlappingCount = matchedFlags.filter((f) => f.matched).length;
  const overlapRatio = overlappingCount / articleShingles.length;

  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  // Longest run of consecutive matched shingles — a real copied phrase.
  let currentRunStart = -1;
  let currentRunLength = 0;
  let longestRun = { length: 0, start: -1 };
  for (let i = 0; i < matchedFlags.length; i++) {
    if (matchedFlags[i]!.matched) {
      if (currentRunLength === 0) currentRunStart = i;
      currentRunLength++;
      if (currentRunLength > longestRun.length) longestRun = { length: currentRunLength, start: currentRunStart };
    } else {
      currentRunLength = 0;
    }
  }

  if (longestRun.length >= LONG_RUN_MIN_CONSECUTIVE_SHINGLES) {
    const runWords = matchedFlags[longestRun.start]!.shingle.concat(
      matchedFlags.slice(longestRun.start + 1, longestRun.start + longestRun.length).map((f) => f.shingle[f.shingle.length - 1]!)
    );
    const sourceIndex = matchedFlags[longestRun.start]!.sourceIndex;
    failed.push({
      code: "SOURCE_TEXT_COPIED",
      severity: "blocking",
      message: `A long phrase appears to be copied or too closely paraphrased from source #${sourceIndex ?? "?"}: "${runWords.join(" ")}"`,
    });
  }

  if (overlapRatio > MAX_OVERLAP_RATIO) {
    const example = matchedFlags.find((f) => f.matched);
    failed.push({
      code: "SOURCE_TEXT_COPIED",
      severity: "blocking",
      message: `Excessive overlap with source material: ${(overlapRatio * 100).toFixed(1)}% of the article's phrasing matches the source pack verbatim (e.g. "${example?.shingle.join(" ") ?? ""}" from source #${example?.sourceIndex ?? "?"}). Rewrite in fresh, original wording.`,
    });
  } else if (overlapRatio > MAX_OVERLAP_RATIO / 2) {
    warnings.push(`${(overlapRatio * 100).toFixed(1)}% of the article's phrasing overlaps with source material — getting close to the originality threshold.`);
  }

  const score = Math.max(0, 100 - failed.length * 40 - Math.round(overlapRatio * 100));
  return { score, failedChecks: failed, warnings };
}
