import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { EndpointCard } from "@/components/EndpointCard";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonBlock } from "@/components/JsonBlock";
import { Badge } from "@/components/ui/Badge";
import { jobGetSucceededResponseExample, jobGetFailedResponseExample } from "@/lib/examples/jobs-fixtures";

export const metadata: Metadata = {
  title: "GET /v1/jobs/{jobId}",
  description: "Poll an async generation job's status and retrieve its result.",
  openGraph: {
    title: "GET /v1/jobs/{jobId} — Keyword-to-Blog API",
    description: "Poll an async generation job's status and retrieve its result.",
    type: "article",
    url: "/docs/api-reference/jobs-get",
  },
};

const baseUrl = "${NEXT_PUBLIC_API_BASE_URL}";

export default function JobsGetEndpointPage() {
  const curl = `curl ${baseUrl}/v1/jobs/job_5f2a9d3e1b \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY"`;

  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">API reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">GET /v1/jobs/&#123;jobId&#125;</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Retrieves the current status of a job created via POST /v1/jobs, and the full result once
          it has succeeded.
        </p>

        <div className="mt-8">
          <EndpointCard
            method="GET"
            path="/v1/jobs/{jobId}"
            headers={[{ name: "Authorization", value: "Bearer <API_KEY>", required: true }]}
          >
            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Status transitions</h3>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">queued</Badge>
                <span className="text-muted">&rarr;</span>
                <Badge tone="amber">processing</Badge>
                <span className="text-muted">&rarr;</span>
                <Badge tone="green">succeeded</Badge>
                <span className="text-muted">or</span>
                <Badge tone="red">failed</Badge>
              </div>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">curl example</h3>
              <CodeBlock filename="shell" code={curl} />
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Example response — succeeded</h3>
              <JsonBlock data={jobGetSucceededResponseExample} />
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Example response — failed</h3>
              <JsonBlock data={jobGetFailedResponseExample} />
            </div>
          </EndpointCard>
        </div>
      </div>
    </DocsPageShell>
  );
}
