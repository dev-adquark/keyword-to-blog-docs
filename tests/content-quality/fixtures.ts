import type { ContentBrief, GenerateRequestV1, SEOPostV1 } from "@/lib/types";

/** A genuinely solid post — long enough, concrete, no repetition — used as
 * the baseline "this should pass" fixture across validator tests. */
export function goodPost(overrides: Partial<SEOPostV1> = {}): SEOPostV1 {
  const defaults: SEOPostV1 = {
    title: "How to Choose a Strong Password for Your Online Accounts",
    slugSuggestion: "how-to-choose-a-strong-password",
    meta: {
      description:
        "A practical guide to choosing passwords that actually resist real-world attacks, with concrete length and complexity targets.",
      primaryKeyword: "strong password",
    },
    outline: {
      h1: "How to Choose a Strong Password",
      h2: ["Why Length Matters More Than Complexity", "Practical Password Strategies", "Common Mistakes to Avoid"],
    },
    sections: [
      {
        type: "introduction",
        heading: "Getting Started",
        contentMarkdown:
          "Password strength is measured primarily by entropy, not by how many special characters you cram in. A 16-character passphrase built from four random words is dramatically harder to crack than an 8-character password with a swapped letter and an exclamation point, because the search space grows exponentially with length. This guide walks through concrete, testable criteria you can apply right now.",
      },
      {
        type: "body",
        heading: "Why Length Matters More Than Complexity",
        contentMarkdown:
          "For example, a 12-character password using only lowercase letters has roughly 26^12 possible combinations, which is about 95 sextillion. Adding 4 more characters multiplies that space by another 26^4, roughly 457,000 times larger, for a fraction of the memorization cost of mixing in symbols. NIST's 2017 guidance (SP 800-63B) recommends prioritizing length over forced complexity rules for exactly this reason, and most security teams now follow it when writing internal password policy documents.",
      },
      {
        type: "body",
        heading: "Practical Password Strategies",
        contentMarkdown:
          "1. Use a password manager to generate and store 20+ character random strings for accounts you don't need to type often.\n2. For passwords you do need to type or remember, use 4-6 unrelated dictionary words, for example 'correct-horse-battery-staple'.\n3. Enable two-factor authentication wherever it's offered, since it protects you even if a password does leak. Combining all three habits closes most of the common account-takeover paths attackers actually use.",
      },
      {
        type: "body",
        heading: "Common Mistakes to Avoid",
        contentMarkdown:
          "Reusing the same password across multiple sites means a single breach exposes every account that shares it — for instance, a leaked forum password often gets tried against banking and email logins within hours. Predictable substitutions like '@' for 'a' or '3' for 'e' are already in every major cracking dictionary, so they add negligible real-world protection, and relying on them creates a false sense of security.",
      },
    ],
    conclusion:
      "Prioritize length over forced complexity, use a password manager for anything you don't type by hand, and turn on two-factor authentication as a second line of defense — those three habits address the vast majority of real-world account compromises.",
  };
  return { ...defaults, ...overrides };
}

export function baseRequest(overrides: Partial<GenerateRequestV1> = {}): GenerateRequestV1 {
  return {
    keywords: ["strong password"],
    topic: "strong password",
    language: "en",
    tone: "professional",
    constraints: { maxWords: 1500 },
    format: { responseTypes: ["json"] },
    ...overrides,
  };
}

export function baseBrief(overrides: Partial<ContentBrief> = {}): ContentBrief {
  return {
    primaryKeyword: "strong password",
    relatedKeywords: ["password manager", "two-factor authentication"],
    searchIntent: "informational",
    language: "en",
    topic: "strong password",
    requiredConcepts: ["password manager", "two-factor authentication"],
    suggestedSections: [],
    faqTopics: [],
    ...overrides,
  };
}
