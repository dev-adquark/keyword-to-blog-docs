import { UsageResponseV1, ErrorResponseV1 } from "@/lib/types";
import { getPlan } from "@/lib/plans";

const growth = getPlan("growth");

export const usageResponseExample = {
  plan: {
    id: growth.id,
    name: growth.name,
    priorityProcessing: growth.priorityProcessing,
    teamSeats: growth.teamSeats,
  },
  periodStart: "2026-09-01T00:00:00.000Z",
  periodEnd: "2026-10-01T00:00:00.000Z",
  metering: {
    unit: "word",
    granularity: "generation",
  },
  limits: {
    monthlyWords: growth.monthlyWords,
    maxWordsPerRequest: growth.maxWordsPerRequest,
    requestsPerMinute: growth.requestsPerMinute,
  },
  consumed: {
    words: 42300,
    posts: 51,
    requests: 58,
  },
  remaining: {
    words: growth.monthlyWords - 42300,
    posts: undefined,
    requests: undefined,
  },
  daily: {
    limit: growth.requestsPerDay,
    used: 12,
    remaining: growth.requestsPerDay - 12,
    resetAt: "2026-09-15T00:00:00.000Z",
  },
} satisfies UsageResponseV1;

export const usageResponseAfterGenerationExample = {
  ...usageResponseExample,
  consumed: {
    words: 43190,
    posts: 52,
    requests: 59,
  },
  remaining: {
    words: growth.monthlyWords - 43190,
    posts: undefined,
    requests: undefined,
  },
} satisfies UsageResponseV1;

export const errorAuthMissingExample = {
  error: {
    code: "AUTH_MISSING",
    message: "No Authorization header was provided.",
    requestId: "req_5c6d7e8f90",
  },
} satisfies ErrorResponseV1;

export const errorAuthInvalidExample = {
  error: {
    code: "AUTH_INVALID",
    message: "The provided API key is not recognized or has been revoked.",
    requestId: "req_a1b2c3d4e5",
  },
} satisfies ErrorResponseV1;

export const errorQuotaExceededExample = {
  error: {
    code: "QUOTA_EXCEEDED",
    message: "Monthly word quota exceeded for plan 'growth'. Upgrade your plan or wait for the next billing period.",
    requestId: "req_f6e5d4c3b2",
    details: { monthlyWords: 200000, consumedWords: 200000, periodEnd: "2026-10-01T00:00:00.000Z" },
  },
} satisfies ErrorResponseV1;

export const errorRateLimitedExample = {
  error: {
    code: "RATE_LIMITED",
    message: "Too many requests. Limit is 15 requests per minute on the 'growth' plan.",
    requestId: "req_11223344aa",
    details: { requestsPerMinute: 15, retryAfterSeconds: 12 },
  },
} satisfies ErrorResponseV1;

export const errorValidationExample = {
  error: {
    code: "VALIDATION_ERROR",
    message: "constraints.maxWords exceeds the plan limit of 2000 words per request.",
    requestId: "req_99887766bb",
    details: { field: "constraints.maxWords", maxAllowed: 2000, received: 5000 },
  },
} satisfies ErrorResponseV1;

export const errorProhibitedInputExample = {
  error: {
    code: "PROHIBITED_INPUT",
    message: "Request content matched a prohibited-input filter and was rejected before generation.",
    requestId: "req_55443322cc",
    details: { field: "topic" },
  },
} satisfies ErrorResponseV1;

export const errorGenerationFailureExample = {
  error: {
    code: "INTERNAL_ERROR",
    message: "Content generation is temporarily unavailable. Please try again shortly.",
    requestId: "req_33221100dd",
  },
} satisfies ErrorResponseV1;

export const errorContentQualityFailedExample = {
  error: {
    code: "CONTENT_QUALITY_FAILED",
    message: "Generated content did not meet the required quality standard after automatic revision.",
    requestId: "req_77889900ee",
    details: {
      revisionCount: 2,
      overallScore: 61,
      failedCheckCodes: ["LOW_EXPERT_DEPTH", "KEYWORD_STUFFING"],
    },
  },
} satisfies ErrorResponseV1;
