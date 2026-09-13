import { SEOPostV1 } from "./Generate";
import { ErrorCode } from "./Error";

export interface WebhookSucceededPayloadV1 {
  event: "job.succeeded";
  jobId: string;
  requestId: string;
  post: SEOPostV1;
  rendered: {
    markdown?: string;
    html?: string;
  };
}

export interface WebhookFailedPayloadV1 {
  event: "job.failed";
  jobId: string;
  requestId: string;
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
  };
}

export type WebhookPayloadV1 = WebhookSucceededPayloadV1 | WebhookFailedPayloadV1;
