import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { JsonBlock } from "@/components/JsonBlock";
import { Badge } from "@/components/ui/Badge";
import {
  errorAuthMissingExample,
  errorAuthInvalidExample,
  errorQuotaExceededExample,
  errorRateLimitedExample,
  errorValidationExample,
  errorProhibitedInputExample,
  errorGenerationFailureExample,
} from "@/lib/examples/usage-and-errors";

export const metadata: Metadata = {
  title: "Error codes",
  description: "Every standardized error code the API returns, with HTTP status mapping.",
  openGraph: {
    title: "Error codes — Keyword-to-Blog API",
    description: "Every standardized error code the API returns, with HTTP status mapping.",
    type: "article",
    url: "/docs/error-codes",
  },
};

const codes = [
  { code: "AUTH_MISSING", status: 401, meaning: "No Authorization header was provided." },
  { code: "AUTH_INVALID", status: 401, meaning: "The API key is malformed, unrecognized, or revoked." },
  { code: "SCOPE_INSUFFICIENT", status: 403, meaning: "The API key is valid but lacks a required scope." },
  { code: "QUOTA_EXCEEDED", status: 429, meaning: "The plan's monthly word or request quota has been reached." },
  { code: "RATE_LIMITED", status: 429, meaning: "The plan's requests-per-minute or requests-per-day limit was exceeded." },
  { code: "VALIDATION_ERROR", status: 400, meaning: "The request body failed schema or constraint validation." },
  { code: "PROHIBITED_INPUT", status: 422, meaning: "Input matched a prohibited-content filter and was rejected." },
  { code: "JOB_NOT_FOUND", status: 404, meaning: "No job exists with the given jobId for this account." },
  { code: "JOB_FAILED", status: 200, meaning: "The job record itself reports status: failed (not an HTTP error)." },
  { code: "INTERNAL_ERROR", status: 500, meaning: "An unexpected server error occurred." },
] as const;

export default function ErrorCodesPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Error codes</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Every non-2xx response (and any failed job) uses the same{" "}
          <code className="font-mono">ErrorResponseV1</code> shape with one of the codes below.
        </p>

        <Table>
          <Thead>
            <Tr><Th>Code</Th><Th>HTTP status</Th><Th>Meaning</Th></Tr>
          </Thead>
          <tbody>
            {codes.map((c) => (
              <Tr key={c.code}>
                <Td><Badge tone={c.status >= 500 ? "red" : c.status >= 400 ? "amber" : "neutral"}>{c.code}</Badge></Td>
                <Td className="font-mono">{c.status}</Td>
                <Td>{c.meaning}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: auth missing</h2>
        <div className="mt-3"><JsonBlock data={errorAuthMissingExample} filename="401" /></div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: auth invalid</h2>
        <div className="mt-3"><JsonBlock data={errorAuthInvalidExample} filename="401" /></div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: quota exceeded</h2>
        <div className="mt-3"><JsonBlock data={errorQuotaExceededExample} filename="429" /></div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: rate limited</h2>
        <div className="mt-3"><JsonBlock data={errorRateLimitedExample} filename="429" /></div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: validation error</h2>
        <p className="mt-3 font-body text-[14px] text-muted">Request exceeded the plan&rsquo;s max words per request:</p>
        <div className="mt-2"><JsonBlock data={errorValidationExample} filename="400" /></div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: prohibited input</h2>
        <div className="mt-3"><JsonBlock data={errorProhibitedInputExample} filename="422" /></div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Example: generation failure</h2>
        <div className="mt-3"><JsonBlock data={errorGenerationFailureExample} filename="500" /></div>
      </div>
    </DocsPageShell>
  );
}
