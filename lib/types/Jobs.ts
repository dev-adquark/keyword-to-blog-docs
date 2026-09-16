import { GenerateRequestV1, SEOPostV1 } from "./Generate";
import { ErrorCode } from "./Error";
import { ContentQualitySummary } from "./ContentQuality";

export interface JobsCreateRequestV1 {
  generateRequest: GenerateRequestV1;
  /** Optional — omit to poll GET /v1/jobs/{jobId} instead of receiving a webhook callback. */
  webhook?: {
    url: string;
    events: Array<"job.succeeded" | "job.failed">;
  };
  format: {
    responseTypes: Array<"json" | "markdown" | "html">;
  };
  idempotencyKey?: string;
}

export interface JobV1 {
  jobId: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  createdAt: string;
  updatedAt: string;
  requestId: string;
  inputSummary: {
    keywords: string[];
    language: string;
    maxWords: number;
  };
  result?: SEOPostV1;
  rendered?: {
    markdown?: string;
    html?: string;
  };
  error?: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
  /** Present only in the POST /v1/jobs creation response, only when a webhook was configured — shown once, never retrievable again. */
  webhookSigningSecret?: string;
  /** Present once the job succeeds — the content quality pipeline always runs. */
  quality?: ContentQualitySummary;
}
