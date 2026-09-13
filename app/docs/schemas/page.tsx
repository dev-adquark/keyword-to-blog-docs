import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { Tabs } from "@/components/ui/Tabs";
import { JsonBlock } from "@/components/JsonBlock";
import { generateRequestExample } from "@/lib/examples/generate-request";
import { generateResponseExample } from "@/lib/examples/generate-response";
import { jobsCreateRequestExample } from "@/lib/examples/jobs-create-request";
import { webhookSuccessPayloadExample } from "@/lib/examples/jobs-fixtures";
import { errorValidationExample } from "@/lib/examples/usage-and-errors";

export const metadata: Metadata = {
  title: "JSON schemas",
  description: "Request, response, webhook, and error JSON schemas for the Keyword-to-Blog API.",
  openGraph: {
    title: "JSON schemas — Keyword-to-Blog API",
    description: "Request, response, webhook, and error JSON schemas for the Keyword-to-Blog API.",
    type: "article",
    url: "/docs/schemas",
  },
};

export default function SchemasPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">JSON schemas</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Every request and response body on this API corresponds to one of the TypeScript types
          below. Field names here match the wire format exactly.
        </p>

        <div className="mt-8">
          <h2 className="mb-3 font-display text-xl font-medium text-ink">POST /v1/generate — request</h2>
          <JsonBlock data={generateRequestExample} filename="GenerateRequestV1" />
        </div>

        <div className="mt-10">
          <h2 className="mb-3 font-display text-xl font-medium text-ink">POST /v1/jobs — request</h2>
          <JsonBlock data={jobsCreateRequestExample} filename="JobsCreateRequestV1" />
        </div>

        <div className="mt-10">
          <h2 className="mb-3 font-display text-xl font-medium text-ink">Generated post — response</h2>
          <Tabs
            tabs={[
              { label: "post (SEOPostV1)", content: <JsonBlock data={generateResponseExample.post} filename="SEOPostV1" /> },
              { label: "full response", content: <JsonBlock data={generateResponseExample} filename="GenerateResponseV1" /> },
            ]}
          />
        </div>

        <div className="mt-10">
          <h2 className="mb-3 font-display text-xl font-medium text-ink">Webhook payload</h2>
          <JsonBlock data={webhookSuccessPayloadExample} filename="WebhookPayloadV1 (job.succeeded)" />
        </div>

        <div className="mt-10">
          <h2 className="mb-3 font-display text-xl font-medium text-ink">Error schema</h2>
          <p className="mb-3 font-body text-[14px] text-muted">
            Every non-2xx response uses this same shape — see{" "}
            <code className="font-mono">/docs/error-codes</code> for the full list of codes.
          </p>
          <JsonBlock data={errorValidationExample} filename="ErrorResponseV1" />
        </div>
      </div>
    </DocsPageShell>
  );
}
