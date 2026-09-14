import { z } from "zod";

export const generateRequestSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1).max(20),
  topic: z.string().min(1).max(200).optional(),
  language: z.string().min(2).max(10),
  region: z.string().max(10).optional(),
  tone: z.enum(["professional", "friendly", "bold"]),
  targetAudience: z.string().max(200).optional(),
  brandVoice: z.string().max(200).optional(),
  industry: z.string().max(100).optional(),
  targetUrl: z.string().url().max(2048).optional(),
  constraints: z.object({
    maxWords: z.number().int().min(100).max(8000),
    minWords: z.number().int().min(50).optional(),
    maxSections: z.number().int().min(1).max(20).optional(),
    includeFAQs: z.boolean().optional(),
    includeInternalLinksPlaceholders: z.boolean().optional(),
    keywordUsageStrategy: z.enum(["balanced", "natural"]).optional(),
  }),
  format: z.object({
    responseTypes: z
      .array(z.enum(["json", "markdown", "html"]))
      .min(1),
  }),
  idempotencyKey: z.string().max(255).optional(),
  clientProvidedRequestId: z.string().max(255).optional(),
});

export const jobsCreateRequestSchema = z.object({
  generateRequest: generateRequestSchema,
  webhook: z
    .object({
      url: z.string().url(),
      events: z.array(z.enum(["job.succeeded", "job.failed"])).min(1),
    })
    .optional(),
  format: z.object({
    responseTypes: z.array(z.enum(["json", "markdown", "html"])).min(1),
  }),
  idempotencyKey: z.string().max(255).optional(),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z.string().trim().email("Please provide a valid email address."),
  password: z
    .string()
    .min(10, "Password must be at least 10 characters long."),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(100),
  environment: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.string()).min(1).optional(),
});

/** Validates the model's structured output before it's ever persisted or returned. */
export const seoPostSchema = z.object({
  title: z.string().min(1),
  slugSuggestion: z.string().min(1),
  meta: z.object({
    description: z.string().min(1),
    primaryKeyword: z.string().min(1),
  }),
  outline: z.object({
    h1: z.string().min(1),
    h2: z.array(z.string()).min(1),
  }),
  sections: z
    .array(
      z.object({
        type: z.enum(["introduction", "body", "faq", "conclusion", "callout"]),
        heading: z.string().optional(),
        contentMarkdown: z.string().min(1),
        callout: z
          .object({ label: z.string(), text: z.string() })
          .optional(),
      })
    )
    .min(1),
  faqs: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .optional(),
  conclusion: z.string().min(1),
  coverageNotes: z
    .object({
      keywordCoverage: z.array(
        z.object({
          keyword: z.string(),
          covered: z.boolean(),
          evidence: z.string(),
        })
      ),
    })
    .optional(),
});

export const accessRequestSchema = z.object({
  requestedPlan: z.enum(["growth", "scale"]),
  reason: z.string().trim().max(1000).optional(),
});
