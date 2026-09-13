export type ErrorCode =
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "SCOPE_INSUFFICIENT"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "PROHIBITED_INPUT"
  | "JOB_NOT_FOUND"
  | "JOB_FAILED"
  | "INTERNAL_ERROR";

export interface ErrorResponseV1 {
  error: {
    code: ErrorCode;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
}
