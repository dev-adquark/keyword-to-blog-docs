import "server-only";

/**
 * Low-level, language-agnostic text primitives shared by every validator —
 * kept in one place so sentence/word/n-gram logic can't quietly drift
 * between writingQuality.ts, originality.ts, readability.ts, etc.
 */

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function splitParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Lowercased word tokens with punctuation stripped — stable across languages
 * that use whitespace word separation (Latin scripts); CJK/Thai etc. would
 * need a different tokenizer, which is out of scope here (see config.ts's
 * isEnglish() gate — non-Latin-script checks are simply skipped, not faked). */
export function tokenizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function wordCount(text: string): number {
  return tokenizeWords(text).length;
}

export function ngrams(words: string[], n: number): string[] {
  if (words.length < n) return [];
  const grams: string[] = [];
  for (let i = 0; i <= words.length - n; i++) {
    grams.push(words.slice(i, i + n).join(" "));
  }
  return grams;
}

/** Counts how many times each n-gram occurs, for repeated-phrase detection. */
export function ngramFrequencies(text: string, n: number): Map<string, number> {
  const grams = ngrams(tokenizeWords(text), n);
  const freq = new Map<string, number>();
  for (const g of grams) freq.set(g, (freq.get(g) ?? 0) + 1);
  return freq;
}

/** Jaccard similarity of two sentences' word sets — a cheap, dependency-free
 * proxy for "these two sentences say roughly the same thing", used to catch
 * near-duplicate sentences without claiming true semantic understanding. */
export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(tokenizeWords(a));
  const setB = new Set(tokenizeWords(b));
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Case-insensitive whole-phrase occurrence count (word-boundary aware). */
export function countPhraseOccurrences(haystack: string, phrase: string): number {
  const escaped = phrase.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return 0;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "giu");
  return (haystack.match(re) ?? []).length;
}

/** Every prose string in a post's sections, in document order — the common
 * unit validators need (never includes headings/titles unless passed explicitly). */
export function collectSectionProse(sections: Array<{ contentMarkdown?: string }>): string[] {
  return sections.map((s) => s.contentMarkdown ?? "").filter(Boolean);
}
