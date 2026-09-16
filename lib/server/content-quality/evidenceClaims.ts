import "server-only";
import type { FailedCheck, GenerateRequestV1, SEOPostV1 } from "@/lib/types";
import { isEnglish } from "./config";
import { collectSectionProse, splitSentences } from "./textStats";

/**
 * Detects fabricated/unsupported evidence in STANDARD (non-verified)
 * generation mode — content generated from the model's own knowledge must
 * never present invented statistics, studies, or expert consensus as
 * established fact. This is separate from factuality.ts's verified-mode
 * policy: that module governs whether the *deployment* can honestly claim
 * verification happened at all; this one catches the model asserting
 * precise, evidence-flavored claims it can't actually back up, regardless
 * of mode.
 *
 * Real example this exists to catch: "Professionals who allocate 15-20
 * focused minutes daily... consistently outpace..." — a precise number
 * dressed up as an established behavioral finding, with no source at all.
 */
export interface EvidenceClaimsResult {
  score: number;
  failedChecks: FailedCheck[];
  warnings: string[];
}

// Claims of external validation with no actual source attached.
const UNSOURCED_RESEARCH_CLAIMS = [
  /\b(?:studies|research|data|evidence)\s+(?:show|shows|prove|proves|indicate|indicates|confirm|confirms|suggest|suggests)\b/i,
  /\b(?:scientifically|clinically)\s+proven\b/i,
  /\bexperts?\s+(?:agree|say|confirm|recommend|note)\s+that\b/i,
  /\bproven\s+strategies\b/i,
  /\baccording to (?:a|one|recent) (?:study|research|survey)\b/i,
  /\b(?:one|a recent) study (?:found|shows|reveals)\b/i,
];

// A specific number/percentage attached to a sweeping claim about how people
// or organizations behave — the exact shape of a fabricated statistic.
const FABRICATED_STATISTIC_PATTERN =
  /\b\d{1,3}(?:\.\d+)?%\s+of\s+(?:people|users|professionals|companies|marketers|readers|consumers|businesses|teams|organizations)\b/i;

// A precise numeric range/duration paired with a definitive outcome verb —
// e.g. "15-20 focused minutes daily... consistently outpace" — presented as
// settled fact with no source at all. Allows up to two intervening words
// (e.g. "focused", "daily") between the number and the unit, since real
// phrasing rarely puts them immediately adjacent.
const PRECISE_UNSOURCED_OUTCOME_PATTERN =
  /\b\d+[-–—]\d+\s+(?:\w+\s+){0,2}(?:minutes?|hours?|days?|weeks?|months?)\b[^.!?]{0,100}\b(?:consistently|always|guarantee[sd]?|outperform|outpace|outmatch)\b/i;

function findMatches(text: string, patterns: RegExp[]): string[] {
  const hits: string[] = [];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) hits.push(match[0]);
  }
  return hits;
}

export function evaluateEvidenceClaims(
  request: GenerateRequestV1,
  post: SEOPostV1
): EvidenceClaimsResult {
  const failed: FailedCheck[] = [];
  const warnings: string[] = [];

  if (!isEnglish(request.language)) {
    warnings.push(`Unsupported-evidence-claim checks are English-only and were skipped for language "${request.language}".`);
    return { score: 100, failedChecks: [], warnings };
  }

  for (const s of post.sections) {
    const text = s.contentMarkdown ?? "";
    if (!text) continue;

    for (const sentence of splitSentences(text)) {
      const researchHits = findMatches(sentence, UNSOURCED_RESEARCH_CLAIMS);
      for (const hit of researchHits) {
        failed.push({
          code: "UNSUPPORTED_EVIDENCE_CLAIM",
          severity: "blocking",
          message: `Claims external validation with no real source: "${hit}" in "${sentence.trim().slice(0, 100)}${sentence.length > 100 ? "…" : ""}". Remove, soften, or attribute it honestly instead of implying independent verification.`,
          section: s.heading ?? s.type,
        });
      }

      if (FABRICATED_STATISTIC_PATTERN.test(sentence)) {
        failed.push({
          code: "UNSUPPORTED_EVIDENCE_CLAIM",
          severity: "blocking",
          message: `A precise statistic about people/organizations is stated as fact with no source: "${sentence.trim().slice(0, 100)}${sentence.length > 100 ? "…" : ""}". Remove the fabricated number or rephrase as a general (unsourced) observation.`,
          section: s.heading ?? s.type,
        });
      }

      if (PRECISE_UNSOURCED_OUTCOME_PATTERN.test(sentence)) {
        failed.push({
          code: "UNSUPPORTED_EVIDENCE_CLAIM",
          severity: "blocking",
          message: `A precise outcome claim is stated as an established, guaranteed result with no source: "${sentence.trim().slice(0, 100)}${sentence.length > 100 ? "…" : ""}". Soften to a general suggestion rather than a guaranteed/consistent outcome.`,
          section: s.heading ?? s.type,
        });
      }
    }
  }

  // Also check the conclusion, which often restates a claim from the body.
  const conclusionProse = collectSectionProse([{ contentMarkdown: post.conclusion }]);
  for (const sentence of splitSentences(conclusionProse.join(" "))) {
    if (findMatches(sentence, UNSOURCED_RESEARCH_CLAIMS).length > 0 || FABRICATED_STATISTIC_PATTERN.test(sentence)) {
      failed.push({
        code: "UNSUPPORTED_EVIDENCE_CLAIM",
        severity: "blocking",
        message: `The conclusion restates an unsupported evidence claim: "${sentence.trim().slice(0, 100)}${sentence.length > 100 ? "…" : ""}".`,
        section: "conclusion",
      });
    }
  }

  const blockingCount = failed.filter((f) => f.severity === "blocking").length;
  const score = Math.max(0, 100 - blockingCount * 35);

  return { score, failedChecks: failed, warnings };
}
