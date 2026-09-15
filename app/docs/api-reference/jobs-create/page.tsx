import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { EndpointCard } from "@/components/EndpointCard";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonBlock } from "@/components/JsonBlock";
import { jobsCreateRequestExample } from "@/lib/examples/jobs-create-request";
import { jobsCreateResponseExample } from "@/lib/examples/jobs-fixtures";

export const metadata: Metadata = {
  title: "POST /v1/jobs",
  description: "Create an asynchronous blog generation job with a webhook callback.",
  openGraph: {
    title: "POST /v1/jobs — Keyword-to-Blog API",
    description: "Create an asynchronous blog generation job with a webhook callback.",
    type: "article",
    url: "/docs/api-reference/jobs-create",
  },
};

const baseUrl = "${NEXT_PUBLIC_API_BASE_URL}";

export default function JobsCreateEndpointPage() {
  const curl = `curl -X POST ${baseUrl}/v1/jobs \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(jobsCreateRequestExample, null, 2)}'`;

  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">API reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">POST /v1/jobs</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Creates an asynchronous generation job. Use this when you&rsquo;d rather not hold a connection
          open, or when you want a webhook delivered on completion.
        </p>

        <div className="mt-8">
          <EndpointCard
            method="POST"
            path="/v1/jobs"
            headers={[{ name: "Authorization", value: "Bearer <API_KEY>", required: true }]}
          >
            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Required fields</h3>
              <ul className="list-disc space-y-1.5 pl-5 font-body text-[14px] text-muted">
                <li><code className="font-mono">generateRequest</code> — the same body shape as POST /v1/generate.</li>
                <li><code className="font-mono">format.responseTypes</code> — which representations (<code className="font-mono">json</code>/<code className="font-mono">markdown</code>/<code className="font-mono">html</code>) the finished job&rsquo;s <code className="font-mono">rendered</code> field and webhook payload will include.</li>
              </ul>
              <h3 className="mb-2 mt-4 font-display text-sm font-medium text-ink">Optional fields</h3>
              <ul className="list-disc space-y-1.5 pl-5 font-body text-[14px] text-muted">
                <li><code className="font-mono">webhook.url</code> / <code className="font-mono">webhook.events</code> — omit to poll GET /v1/jobs/{"{jobId}"} instead. When provided, both are required together.</li>
                <li><code className="font-mono">idempotencyKey</code> — replaying the same key with the same body returns the original job instead of creating (and billing) a second one; reusing it with a different body is rejected with <code className="font-mono">VALIDATION_ERROR</code>.</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">curl example</h3>
              <CodeBlock filename="shell" code={curl} />
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Example response — 202 Accepted</h3>
              <JsonBlock data={jobsCreateResponseExample} />
            </div>
          </EndpointCard>
        </div>
      </div>
    </DocsPageShell>
  );
}
