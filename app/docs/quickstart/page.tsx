import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonBlock } from "@/components/JsonBlock";
import { Alert } from "@/components/ui/Alert";
import { generateRequestExample } from "@/lib/examples/generate-request";
import { generateResponseExample } from "@/lib/examples/generate-response";
import { jobsCreateRequestExample } from "@/lib/examples/jobs-create-request";
import { jobsCreateResponseExample, webhookSuccessPayloadExample } from "@/lib/examples/jobs-fixtures";

export const metadata: Metadata = {
  title: "Quickstart",
  description: "Make your first Keyword-to-Blog API request in under 15 minutes.",
  openGraph: {
    title: "Quickstart — Keyword-to-Blog API",
    description: "Make your first Keyword-to-Blog API request in under 15 minutes.",
    type: "article",
    url: "/docs/quickstart",
  },
};

const baseUrl = "${NEXT_PUBLIC_API_BASE_URL}";

export default function QuickstartPage() {
  const syncCurl = `curl -X POST ${baseUrl}/v1/generate \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(generateRequestExample, null, 2)}'`;

  const asyncCreateCurl = `curl -X POST ${baseUrl}/v1/jobs \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(jobsCreateRequestExample, null, 2)}'`;

  const pollCurl = `curl ${baseUrl}/v1/jobs/${jobsCreateResponseExample.jobId} \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY"`;

  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Getting started</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Quickstart</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          This walks through your first successful request — synchronous generation first, then
          the asynchronous job + webhook pattern most pipelines use in production.
        </p>

        <h2 id="get-an-api-key" className="mt-10 font-display text-xl font-medium text-ink">
          1. Get an API key
        </h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 font-body text-[15px] text-muted">
          <li>Sign in to your dashboard and open Settings &rarr; API keys.</li>
          <li>Click &ldquo;Create key&rdquo;, choose a scope (generate, jobs, usage), and name it.</li>
          <li>Copy the key immediately — it&rsquo;s shown only once.</li>
        </ol>
        <div className="mt-4">
          <CodeBlock filename=".env" code={`KEYWORD_TO_BLOG_API_KEY="ktb_live_xxxxxxxxxxxxxxxxxxxxxxxx"`} />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">2. Synchronous generation</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Best for interactive use or low-volume calls where you can wait a few seconds for the
          full post inline.
        </p>
        <div className="mt-4">
          <CodeBlock filename="shell" code={syncCurl} />
        </div>
        <p className="mt-4 font-body text-[15px] text-muted">Example response:</p>
        <div className="mt-2">
          <JsonBlock data={generateResponseExample} filename="200 OK" />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">
          3. Asynchronous generation + webhook
        </h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Best for batch pipelines: create a job, then either poll it or let your webhook endpoint
          receive the result.
        </p>
        <div className="mt-4">
          <CodeBlock filename="shell" code={asyncCreateCurl} />
        </div>
        <p className="mt-4 font-body text-[15px] text-muted">Then poll for the result:</p>
        <div className="mt-2">
          <CodeBlock filename="shell" code={pollCurl} />
        </div>
        <p className="mt-4 font-body text-[15px] text-muted">
          Or receive it automatically at the webhook URL you configured:
        </p>
        <div className="mt-2">
          <JsonBlock data={webhookSuccessPayloadExample} filename="POST your-webhook-url" />
        </div>

        <div className="mt-10">
          <Alert tone="info" title="Base URL">
            Every example on this site uses <code className="font-mono">NEXT_PUBLIC_API_BASE_URL</code>{" "}
            as the base — replace it with your actual deployment host.
          </Alert>
        </div>
      </div>
    </DocsPageShell>
  );
}
