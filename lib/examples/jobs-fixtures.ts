import { JobV1 } from "@/lib/types";
import { WebhookSucceededPayloadV1, WebhookFailedPayloadV1 } from "@/lib/types";
import { generateResponseExample } from "./generate-response";

export const jobsCreateResponseExample = {
  jobId: "job_5f2a9d3e1b",
  status: "queued",
  createdAt: "2026-09-10T14:02:11.000Z",
  updatedAt: "2026-09-10T14:02:11.000Z",
  requestId: "req_9f3a1c2e4b",
  inputSummary: {
    keywords: ["ai content marketing", "small business seo"],
    language: "en",
    maxWords: 900,
  },
  webhookSigningSecret: "whsec_5f2a9d3e1b4c7a8f0d6e2b1c3a9f8e7d",
} satisfies JobV1;

export const jobGetSucceededResponseExample = {
  jobId: "job_5f2a9d3e1b",
  status: "succeeded",
  createdAt: "2026-09-10T14:02:11.000Z",
  updatedAt: "2026-09-10T14:02:47.000Z",
  requestId: "req_9f3a1c2e4b",
  inputSummary: {
    keywords: ["ai content marketing", "small business seo"],
    language: "en",
    maxWords: 900,
  },
  result: generateResponseExample.post,
  rendered: generateResponseExample.rendered,
} satisfies JobV1;

export const jobGetFailedResponseExample = {
  jobId: "job_1a2b3c4d5e",
  status: "failed",
  createdAt: "2026-09-10T15:10:02.000Z",
  updatedAt: "2026-09-10T15:10:19.000Z",
  requestId: "req_2b3c4d5e6f",
  inputSummary: {
    keywords: ["enterprise data warehousing"],
    language: "en",
    maxWords: 5000,
  },
  error: {
    code: "VALIDATION_ERROR",
    message: "constraints.maxWords exceeds the plan limit of 2000 words per request.",
    details: { field: "constraints.maxWords", maxAllowed: 2000, received: 5000 },
  },
} satisfies JobV1;

export const webhookSuccessPayloadExample = {
  event: "job.succeeded",
  jobId: "job_5f2a9d3e1b",
  requestId: "req_9f3a1c2e4b",
  post: generateResponseExample.post,
  rendered: generateResponseExample.rendered,
} satisfies WebhookSucceededPayloadV1;

export const webhookFailedPayloadExample = {
  event: "job.failed",
  jobId: "job_1a2b3c4d5e",
  requestId: "req_2b3c4d5e6f",
  error: {
    code: "VALIDATION_ERROR",
    message: "constraints.maxWords exceeds the plan limit of 2000 words per request.",
    details: { field: "constraints.maxWords", maxAllowed: 2000, received: 5000 },
  },
} satisfies WebhookFailedPayloadV1;
