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
    contentMarkdown: string;
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
}
