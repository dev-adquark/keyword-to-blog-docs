import "server-only";
import type { FailedCheck, SEOPostV1 } from "@/lib/types";
import { REPETITION_THRESHOLDS } from "./config";
import { splitSentences, jaccardSimilarity, ngramFrequencies, collectSectionProse } from "./textStats";

/**
 * Internal duplication/repetition checks — explicitly NOT a plagiarism or
 * legal-originality detector (this app has no external corpus to compare
 * against). It flags: duplicate/near-duplicate sentences, duplicate
 * headings, and excessive verbatim n-gram repetition (boilerplate/stuffing).
 */

export interface OriginalityResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

function findDuplicateHeadings(post: SEOPostV1, failed: FailedCheck[]): void {
  const seen = new Map<string, number>();
  for (const s of post.sections) {
    if (!s.heading) continue;
    const key = s.heading.trim().toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [heading, count] of seen) {
    if (count > 1) {
      failed.push({
        code: "DUPLICATE_HEADING",
        severity: "blocking",
        message: `The heading "${heading}" appears ${count} times.`,
      });
    }
  }
}

function findNearDuplicateSentences(post: SEOPostV1, failed: FailedCheck[], warnings: string[]): void {
  const allText = collectSectionProse(post.sections).join(" ");
  const sentences = splitSentences(allText).filter((s) => s.length >= 25);
  if (sentences.length < 2) return;

  let nearDuplicatePairs = 0;
  const flaggedExamples: string[] = [];
  for (let i = 0; i < sentences.length; i++) {
    for (let j = i + 1; j < sentences.length; j++) {
      const similarity = jaccardSimilarity(sentences[i]!, sentences[j]!);
      if (similarity >= REPETITION_THRESHOLDS.nearDuplicateSimilarity) {
        nearDuplicatePairs++;
        if (flaggedExamples.length < 3) flaggedExamples.push(sentences[i]!.slice(0, 70));
      }
    }
  }

  const ratio = nearDuplicatePairs / sentences.length;
  if (ratio > REPETITION_THRESHOLDS.maxNearDuplicateRatio) {
    failed.push({
      code: "NEAR_DUPLICATE_SENTENCES",
      severity: "blocking",
      message: `${nearDuplicatePairs} pairs of near-duplicate sentences found (e.g. "${flaggedExamples[0] ?? ""}…") — the same point is being restated rather than developed.`,
    });
  } else if (nearDuplicatePairs > 0) {
    warnings.push(`${nearDuplicatePairs} sentence pair(s) are very similar in wording.`);
  }
}

/** A specific 4+-word phrase repeated many times verbatim across the whole
 * document is boilerplate/stuffing, not natural variation in phrasing. */
function findExcessivePhraseRepetition(post: SEOPostV1, failed: FailedCheck[]): void {
  const allText = [
    post.title,
    ...post.outline.h2,
    ...collectSectionProse(post.sections),
    post.conclusion,
  ].join(" ");
  const freq = ngramFrequencies(allText, 5);
  const offenders = [...freq.entries()]
    .filter(([, count]) => count > REPETITION_THRESHOLDS.maxExactPhraseRepeats)
    .sort((a, b) => b[1] - a[1]);

  // Overlapping n-grams from one long repeated run would otherwise produce
  // dozens of near-identical entries — cap to the worst few, distinct signal.
  for (const [phrase, count] of offenders.slice(0, 3)) {
    failed.push({
      code: "EXCESSIVE_PHRASE_REPETITION",
      severity: "blocking",
      message: `The 5-word phrase "${phrase}" is repeated verbatim ${count} times.`,
    });
  }
}

export function evaluateOriginality(post: SEOPostV1): OriginalityResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  findDuplicateHeadings(post, failed);
  findNearDuplicateSentences(post, failed, warnings);
  findExcessivePhraseRepetition(post, failed);

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const warningCount = failed.filter((f) => f.severity === "warning").length;
  const score = Math.max(0, 100 - blockingCount * 30 - warningCount * 10);

  return { score, failedChecks: failed, warnings };
}
