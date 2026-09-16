import { GenerateResponseV1 } from "@/lib/types";

export const generateResponseExample = {
  requestId: "req_9f3a1c2e4b",
  post: {
    title: "AI Content Marketing for Small Businesses: A Practical Starting Point",
    slugSuggestion: "ai-content-marketing-small-business",
    meta: {
      description:
        "A practical guide to using AI content marketing as a small business, without losing the voice your customers already trust.",
      primaryKeyword: "ai content marketing",
    },
    outline: {
      h1: "AI Content Marketing for Small Businesses: A Practical Starting Point",
      h2: [
        "Why small businesses are turning to AI content marketing",
        "Where AI helps most, and where it doesn't",
        "Keeping your brand voice consistent",
        "A simple weekly workflow",
        "Frequently asked questions",
      ],
    },
    sections: [
      {
        type: "introduction",
        contentMarkdown:
          "Most small business owners don't have a marketing department. AI content marketing tools promise to fill that gap, but the real question isn't whether AI can write — it's whether it can write like *you*.",
      },
      {
        type: "body",
        heading: "Why small businesses are turning to AI content marketing",
        contentMarkdown:
          "Small business SEO used to mean choosing between hiring a writer or falling behind. AI content marketing changes that math by making a consistent publishing schedule achievable without a full-time hire.",
      },
      {
        type: "body",
        heading: "Where AI helps most, and where it doesn't",
        contentMarkdown:
          "AI is strongest at first drafts, outlines, and repetitive formats like FAQs. It's weakest at judgment calls that depend on knowing your actual customers — so keep a human review step for anything customer-facing.",
      },
      {
        type: "callout",
        contentMarkdown: "A five-minute voice check before publishing catches most AI-sounding phrasing.",
        callout: {
          label: "Quick tip",
          text: "Read the draft aloud. If it doesn't sound like something you'd actually say to a customer, rewrite that line.",
        },
      },
      {
        type: "body",
        heading: "Keeping your brand voice consistent",
        contentMarkdown:
          "Give the tool a short brand voice brief once, then reuse it: three adjectives, one thing you never say, and one real customer question you hear often.",
      },
      {
        type: "body",
        heading: "A simple weekly workflow",
        contentMarkdown:
          "Draft on Monday, review and edit Tuesday, publish Wednesday. Keeping a fixed cadence matters more than any individual post.",
      },
      {
        type: "faq",
        heading: "Frequently asked questions",
        contentMarkdown: "",
      },
      {
        type: "conclusion",
        contentMarkdown:
          "AI content marketing works best as a drafting partner, not a replacement for judgment. Start with one post a week and keep your own voice in the final pass.",
      },
    ],
    faqs: [
      {
        question: "Will AI-written content hurt my SEO?",
        answer:
          "Search engines rank content on quality and usefulness, not on how it was drafted. Editing for accuracy and voice before publishing is what matters.",
      },
      {
        question: "How much editing does an AI draft usually need?",
        answer:
          "Expect to adjust specific claims, add real examples from your business, and tighten anything that reads generic.",
      },
    ],
    conclusion:
      "AI content marketing works best as a drafting partner, not a replacement for judgment. Start with one post a week and keep your own voice in the final pass.",
    coverageNotes: {
      keywordCoverage: [
        { keyword: "ai content marketing", covered: true, evidence: "Appears in title, H1, and introduction." },
        { keyword: "small business seo", covered: true, evidence: "Appears in the second H2 section." },
      ],
    },
  },
  rendered: {
    markdown:
      "# AI Content Marketing for Small Businesses: A Practical Starting Point\n\nMost small business owners don't have a marketing department...",
  },
  debug: {
    generationModel: "claude-haiku-4-5-20251001",
  },
  quality: {
    status: "pass",
    score: 91,
    revisionCount: 0,
    qualityVersion: "1.0.0",
  },
} satisfies GenerateResponseV1;
