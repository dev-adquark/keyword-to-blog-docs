import { GenerateRequestV1, SEOPostV1 } from "./Generate";
import { ErrorCode } from "./Error";

export interface JobsCreateRequestV1 {
  generateRequest: GenerateRequestV1;
  webhook: {
    url: string;
    events: Array<"job.succeeded" | "job.failed">;
    signingSecretPresent?: boolean;
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
}
