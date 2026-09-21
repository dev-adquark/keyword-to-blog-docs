import { z } from "zod";

export const generateRequestSchema = z
  .object({
    keywords: z.array(z.string().min(1)).min(1).max(20),
    topic: z.string().min(1).max(200).optional(),
    language: z.string().min(2).max(10),
    region: z.string().max(10).optional(),
    tone: z.enum(["professional", "friendly", "bold"]),
    targetAudience: z.string().max(200).optional(),
    brandVoice: z.string().max(200).optional(),
    industry: z.string().max(100).optional(),
    targetUrl: z.string().url().max(2048).optional(),
    factualityMode: z.enum(["standard", "verified"]).optional(),
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
  })
  .refine(
    (data) => data.constraints.minWords === undefined || data.constraints.minWords <= data.constraints.maxWords,
    {
      message: "constraints.minWords must not exceed constraints.maxWords.",
      path: ["constraints", "minWords"],
    }
  );

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

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const otpCodeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.");
const emailSchema = z.string().trim().email("Please provide a valid email address.");

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const verifyResetOtpSchema = z.object({
  email: emailSchema,
  otp: otpCodeSchema,
});

export const resetPasswordSchema = z
  .object({
    resetToken: z.string().min(1),
    newPassword: z.string().min(10, "Password must be at least 10 characters long."),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
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
      z
        .object({
          type: z.enum(["introduction", "body", "faq", "conclusion", "callout"]),
          heading: z.string().optional(),
          // A pure callout section legitimately carries its content in
          // `callout`, not `contentMarkdown` — real model output does this
          // (confirmed against a live Claude response). Every other section
          // still needs real prose.
          contentMarkdown: z.string().min(1).optional(),
          callout: z
            .object({ label: z.string(), text: z.string() })
            .optional(),
        })
        .refine((s) => Boolean(s.contentMarkdown) || Boolean(s.callout), {
          message: "Section must have either contentMarkdown or a callout.",
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
  sources: z
    .array(
      z.object({
        title: z.string().min(1),
        url: z.string().min(1),
        publishedAt: z.string().nullable(),
      })
    )
    .optional(),
});

export const accessRequestSchema = z.object({
  requestedPlan: z.enum(["growth", "scale"]),
  reason: z.string().trim().max(1000).optional(),
});

/**
 * Validates the model's targeted repair output — a PARTIAL patch, never a
 * full re-generation. Every field is optional (the model only returns what
 * it actually fixed); whatever it omits is left untouched by the caller.
 */
export const repairPatchSchema = z.object({
  title: z.string().min(1).optional(),
  slugSuggestion: z.string().min(1).optional(),
  meta: z
    .object({
      description: z.string().min(1).optional(),
      primaryKeyword: z.string().min(1).optional(),
    })
    .optional(),
  sections: z
    .array(
      z.object({
        index: z.number().int().min(0),
        heading: z.string().optional(),
        contentMarkdown: z.string().min(1).optional(),
      })
    )
    .optional(),
  faqs: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  conclusion: z.string().min(1).optional(),
});
