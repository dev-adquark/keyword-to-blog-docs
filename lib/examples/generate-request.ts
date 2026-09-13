import { GenerateRequestV1 } from "@/lib/types";

export const generateRequestExample = {
  keywords: ["ai content marketing", "small business seo"],
  topic: "How small businesses can use AI content marketing without losing their voice",
  language: "en",
  region: "US",
  tone: "friendly",
  targetAudience: "small business owners with no in-house marketing team",
  brandVoice: "warm, practical, no jargon",
  industry: "marketing services",
  targetUrl: "https://example.com/blog/ai-content-marketing",
  constraints: {
    maxWords: 900,
    minWords: 600,
    maxSections: 5,
    includeFAQs: true,
    includeInternalLinksPlaceholders: true,
    keywordUsageStrategy: "natural",
  },
  format: {
    responseTypes: ["json", "markdown"],
  },
  clientProvidedRequestId: "req_local_0192",
} satisfies GenerateRequestV1;
