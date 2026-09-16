import type { ContentQualitySummary } from "./ContentQuality";

export interface GenerateRequestV1 {
  keywords: string[]; // at least 1
  topic?: string;
  language: string; // e.g. "en"
  region?: string;
  tone: "professional" | "friendly" | "bold";
  targetAudience?: string;
  brandVoice?: string;
  industry?: string;
  targetUrl?: string;
  /**
   * Optional — defaults to "standard" when omitted (fully backward
   * compatible with existing requests). "standard" content is generated from
   * model knowledge with no claim of external verification. "verified"
   * requires source-backed verification of factual claims; since this
   * deployment has no source-retrieval capability, "verified" requests
   * currently fail the quality gate with CONTENT_QUALITY_FAILED rather than
   * fabricating verification — see lib/server/content-quality/factuality.ts.
   */
  factualityMode?: "standard" | "verified";
  constraints: {
    maxWords: number;
    minWords?: number;
    maxSections?: number;
    includeFAQs?: boolean;
    includeInternalLinksPlaceholders?: boolean;
    keywordUsageStrategy?: "balanced" | "natural";
  };
  format: {
    responseTypes: Array<"json" | "markdown" | "html">;
  };
  idempotencyKey?: string;
  clientProvidedRequestId?: string;
}

export interface SEOPostV1 {
  title: string;
  slugSuggestion: string;
  meta: {
    description: string;
    primaryKeyword: string;
  };
  outline: {
    h1: string;
    h2: string[];
  };
  sections: Array<{
    type: "introduction" | "body" | "faq" | "conclusion" | "callout";
    heading?: string;
    /** Optional only for a pure callout section — every other section has real prose. */
    contentMarkdown?: string;
    callout?: { label: string; text: string };
  }>;
  faqs?: Array<{ question: string; answer: string }>;
  conclusion: string;
  coverageNotes?: {
    keywordCoverage: Array<{ keyword: string; covered: boolean; evidence: string }>;
  };
}

export interface GenerateResponseV1 {
  requestId: string;
  jobId?: string;
  post: SEOPostV1;
  rendered: {
    markdown?: string;
    html?: string;
    rawJson?: SEOPostV1;
  };
  debug?: {
    generationModel?: string;
  };
  /** Present on every successful response — the content quality pipeline
   * always runs; see lib/server/content-quality/. */
  quality?: ContentQualitySummary;
}
