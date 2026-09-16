import "server-only";
import type { FailedCheck, SEOPostV1 } from "@/lib/types";
import { isEnglish } from "./config";
import { splitSentences, tokenizeWords, countPhraseOccurrences, collectSectionProse } from "./textStats";

/**
 * Detects robotic/low-quality writing patterns. This is a QUALITY signal,
 * not an "AI detector" — it never estimates or reports an "AI probability",
 * only concrete, explainable pattern matches (frequency + repetition +
 * structure), matching the product requirement not to make unprovable
 * detection claims.
 */

// English-only phrase lists — gated by isEnglish() so non-English content is
// never falsely flagged by rules that don't apply to it (see config.ts).
// Patterns cover common contractions ("it's"/"you're") alongside the
// uncontracted form, since a phrase-list check that only catches one variant
// misses the other half of real-world usage.
const GENERIC_INTRO_PATTERNS = [
  /\bin today'?s (?:digital|fast-paced|ever-changing|ever-evolving|rapidly changing|rapidly evolving|fast-moving|modern) (?:world|landscape|era|age)\b/i,
  /\bin an increasingly\b/i,
  /\bin the (?:ever-changing|fast-paced|rapidly evolving) world of\b/i,
  /\bin the world of\b/i,
  /\bwhether you(?:'re| are)\b.*\bor\b/i,
  /\bit'?s no secret that\b/i,
  /\bhave you ever wondered\b/i,
];

const GENERIC_CONCLUSION_PATTERNS = [
  /\bin conclusion\b/i,
  /\bto (?:sum|wrap) (?:up|it up)\b/i,
  /\bat the end of the day\b/i,
  /\bby following these (?:tips|steps|guidelines)\b/i,
];

const FILLER_PHRASES = [
  /\bit(?:'s| is) important to note that\b/i,
  /\bit'?s worth (?:noting|mentioning) that\b/i,
  /\bneedless to say\b/i,
  /\bas (?:we all know|previously mentioned)\b/i,
  /\bwithout (?:a doubt|further ado)\b/i,
];

const GENERIC_MARKETING_PATTERNS = [
  /\bunlock (?:the|your) (?:power|potential|full potential)\b/i,
  /\btake your .* to the next level\b/i,
  /\bgame[- ]changer\b/i,
  /\brevolutioniz(?:e|ing)\b/i,
  /\bunlock your (?:success|productivity|potential)\b/i,
];

/**
 * A broader, structural (not phrase-specific) signal: sentences opening with
 * "The <noun> is/lies/means/requires/transforms/matters..." are a common
 * shallow, abstract-hedge construction ("The goal is...", "the challenge
 * is...", "the difference lies...", "the gap between... is...", "this
 * approach transforms..."). One such opener isn't inherently bad; several
 * DIFFERENT sections all reaching for the same abstract template is what
 * signals templated writing, so this counts distinct sections rather than
 * blacklisting any single phrase.
 */
const ABSTRACT_OPENER_PATTERN =
  /^(?:the\s+\w+(?:\s+\w+)?\s+(?:is|lies|means|requires|transforms|matters)\b|this\s+\w+\s+transforms\b)/i;

/** Generic corporate/buzzword adjectives and verbs — repeated use of the
 * SAME one across a document reads as filler rather than specific, earned
 * description. Not a ban on ever using these words once. */
const OVERUSED_BUZZWORDS = [
  "seamless",
  "seamlessly",
  "robust",
  "cutting-edge",
  "holistic",
  "leverage",
  "leveraging",
  "synergy",
  "streamline",
  "streamlined",
  "actionable",
  "game-changing",
  "innovative",
  "dynamic",
];

const MAX_BUZZWORD_REPEATS = 2;

const SENTENCE_STARTERS_TO_WATCH = ["this", "it", "these", "additionally", "furthermore", "moreover"];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/** Flags a section whose first 1-2 sentences read like a generic template opener. */
function detectGenericIntro(post: SEOPostV1, failed: FailedCheck[]): void {
  const intro = post.sections.find((s) => s.type === "introduction");
  const text = intro?.contentMarkdown ?? "";
  if (!text) return;
  const opening = splitSentences(text).slice(0, 2).join(" ");
  if (matchesAny(opening, GENERIC_INTRO_PATTERNS)) {
    failed.push({
      code: "GENERIC_INTRO",
      severity: "blocking",
      message: "The introduction opens with a generic, templated phrase instead of stating the article's specific value.",
      section: "introduction",
    });
  }
}

function detectGenericConclusion(post: SEOPostV1, failed: FailedCheck[]): void {
  if (matchesAny(post.conclusion, GENERIC_CONCLUSION_PATTERNS)) {
    failed.push({
      code: "GENERIC_CONCLUSION",
      severity: "blocking",
      message: "The conclusion relies on a generic wrap-up phrase instead of a genuine final takeaway.",
      section: "conclusion",
    });
  }
}

function detectFillerAndMarketingLanguage(post: SEOPostV1, failed: FailedCheck[], warnings: string[]): void {
  let fillerHits = 0;
  let marketingHits = 0;
  for (const s of post.sections) {
    const text = s.contentMarkdown ?? "";
    if (matchesAny(text, FILLER_PHRASES)) fillerHits++;
    if (matchesAny(text, GENERIC_MARKETING_PATTERNS)) marketingHits++;
  }
  if (fillerHits >= 2) {
    failed.push({
      code: "FILLER_CONTENT",
      severity: "warning",
      message: `Filler phrases ("it is important to note that", etc.) appear in ${fillerHits} sections.`,
    });
  } else if (fillerHits === 1) {
    warnings.push("One section contains a filler phrase that adds no information.");
  }
  if (marketingHits >= 1) {
    failed.push({
      code: "GENERIC_MARKETING_LANGUAGE",
      severity: "warning",
      message: "Generic marketing language (e.g. \"unlock the power of\", \"game-changer\") was detected.",
    });
  }
}

/** A body section is "robotic" if most of its sentences start with the same
 * small set of words/connectors — real writing varies sentence openings. */
function detectRepetitiveSentenceStarters(post: SEOPostV1, failed: FailedCheck[]): void {
  for (const s of post.sections) {
    const text = s.contentMarkdown ?? "";
    const sentences = splitSentences(text);
    if (sentences.length < 4) continue;
    const starters = sentences.map((sent) => tokenizeWords(sent)[0] ?? "");
    const watched = starters.filter((w) => SENTENCE_STARTERS_TO_WATCH.includes(w));
    if (watched.length / sentences.length >= 0.4) {
      failed.push({
        code: "REPETITIVE_SENTENCE_STARTERS",
        severity: "warning",
        message: `Section "${s.heading ?? s.type}" repeatedly opens sentences with the same connector words.`,
        section: s.heading ?? s.type,
      });
    }
  }
}

/** Same exact sentence (ignoring case/whitespace) appearing 3+ times across
 * the whole document is a mechanical-repetition signal, not natural writing. */
function detectRepetitiveSentences(post: SEOPostV1, failed: FailedCheck[]): void {
  const allText = collectSectionProse(post.sections).join(" ");
  const sentences = splitSentences(allText).map((s) => s.toLowerCase().trim());
  const counts = new Map<string, number>();
  for (const s of sentences) {
    if (s.length < 20) continue; // skip trivially short fragments
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const [sentence, count] of counts) {
    if (count >= 3) {
      failed.push({
        code: "REPETITIVE_SENTENCES",
        severity: "blocking",
        message: `The same sentence appears ${count} times verbatim: "${sentence.slice(0, 80)}${sentence.length > 80 ? "…" : ""}"`,
      });
    }
  }
}

/**
 * Structural (not phrase-based) check: counts how many DIFFERENT sections
 * open with the same shallow "The <noun> is/lies/transforms..." template.
 * One match is unremarkable; several sections all reaching for the same
 * abstract-hedge construction is templated writing regardless of which
 * exact words fill it in — this is what makes it broader than a blacklist.
 */
function detectFormulaicAbstractOpeners(post: SEOPostV1, failed: FailedCheck[]): void {
  const matchingSections: string[] = [];
  for (const s of post.sections) {
    const text = s.contentMarkdown ?? "";
    const firstSentence = splitSentences(text)[0] ?? "";
    if (ABSTRACT_OPENER_PATTERN.test(firstSentence.trim())) {
      matchingSections.push(s.heading ?? s.type);
    }
  }
  if (matchingSections.length >= 2) {
    failed.push({
      code: "FORMULAIC_SECTION_OPENERS",
      severity: "blocking",
      message: `${matchingSections.length} sections (${matchingSections.join(", ")}) all open with the same shallow "The [noun] is/lies/transforms..." abstract-hedge construction instead of a concrete, section-specific opening.`,
    });
  }
}

/** Repeated reuse of the SAME generic corporate buzzword across the document
 * reads as filler description rather than specific, earned detail. */
function detectOverusedBuzzwords(post: SEOPostV1, failed: FailedCheck[]): void {
  const allText = [
    post.title,
    ...collectSectionProse(post.sections),
    post.conclusion,
  ].join(" ");

  const offenders: string[] = [];
  for (const word of OVERUSED_BUZZWORDS) {
    if (countPhraseOccurrences(allText, word) > MAX_BUZZWORD_REPEATS) {
      offenders.push(word);
    }
  }
  if (offenders.length > 0) {
    failed.push({
      code: "OVERUSED_BUZZWORDS",
      severity: "warning",
      message: `Generic corporate word(s) repeated more than ${MAX_BUZZWORD_REPEATS} times: ${offenders.join(", ")}.`,
    });
  }
}

export interface WritingQualityResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

export function evaluateWritingQuality(post: SEOPostV1, language: string): WritingQualityResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  if (!isEnglish(language)) {
    // English-specific phrase lists would produce false positives on other
    // languages — skip pattern checks entirely rather than fake a signal.
    warnings.push(`Writing-pattern checks are English-only and were skipped for language "${language}".`);
    return { score: 100, failedChecks: [], warnings };
  }

  detectGenericIntro(post, failed);
  detectGenericConclusion(post, failed);
  detectFillerAndMarketingLanguage(post, failed, warnings);
  detectRepetitiveSentenceStarters(post, failed);
  detectRepetitiveSentences(post, failed);
  detectFormulaicAbstractOpeners(post, failed);
  detectOverusedBuzzwords(post, failed);

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const warningCount = failed.filter((f) => f.severity === "warning").length;
  const score = Math.max(0, 100 - blockingCount * 25 - warningCount * 8);

  return { score, failedChecks: failed, warnings };
}
