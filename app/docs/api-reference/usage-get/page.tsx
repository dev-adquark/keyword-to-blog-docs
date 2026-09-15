import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { EndpointCard } from "@/components/EndpointCard";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonBlock } from "@/components/JsonBlock";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { usageResponseExample, usageResponseAfterGenerationExample } from "@/lib/examples/usage-and-errors";

export const metadata: Metadata = {
  title: "GET /v1/usage",
  description: "Metered usage reporting for the current billing period.",
  openGraph: {
    title: "GET /v1/usage — Keyword-to-Blog API",
    description: "Metered usage reporting for the current billing period.",
    type: "article",
    url: "/docs/api-reference/usage-get",
  },
};

const baseUrl = "${NEXT_PUBLIC_API_BASE_URL}";

export default function UsageEndpointPage() {
  const curl = `curl ${baseUrl}/v1/usage \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY"`;

  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">API reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">GET /v1/usage</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Returns metered usage for the current billing period, so you can check remaining quota
          before running a large batch.
        </p>

        <div className="mt-8">
          <EndpointCard
            method="GET"
            path="/v1/usage"
            headers={[{ name: "Authorization", value: "Bearer <API_KEY>", required: true }]}
          >
            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Response fields</h3>
              <Table>
                <Thead>
                  <Tr><Th>Field</Th><Th>Meaning</Th></Tr>
                </Thead>
                <tbody>
                  <Tr><Td className="font-mono">plan</Td><Td>Current plan id, name, priority processing, and seat count.</Td></Tr>
                  <Tr><Td className="font-mono">periodStart / periodEnd</Td><Td>The current billing period boundaries (ISO 8601).</Td></Tr>
                  <Tr><Td className="font-mono">limits</Td><Td>Monthly word/post caps, per-request word cap, and requests/minute.</Td></Tr>
                  <Tr><Td className="font-mono">consumed</Td><Td>Usage so far this period.</Td></Tr>
                  <Tr><Td className="font-mono">remaining</Td><Td>Limits minus consumed, for the metered units your plan tracks.</Td></Tr>
                  <Tr><Td className="font-mono">metering</Td><Td>Which unit (word/post) and granularity (request/generation) is billed.</Td></Tr>
                  <Tr><Td className="font-mono">daily</Td><Td>Your per-API-key requests-per-day quota — the primary throughput lever on the Starter plan. Resets at UTC midnight.</Td></Tr>
                </tbody>
              </Table>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">curl example</h3>
              <CodeBlock filename="shell" code={curl} />
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Example response</h3>
              <JsonBlock data={usageResponseExample} />
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">
                After running one more generation (890 words consumed)
              </h3>
              <p className="mb-2 font-body text-[14px] text-muted">
                Note <code className="font-mono">consumed.words</code> and{" "}
                <code className="font-mono">remaining.words</code> both shift accordingly:
              </p>
              <JsonBlock data={usageResponseAfterGenerationExample} />
            </div>
          </EndpointCard>
        </div>
      </div>
    </DocsPageShell>
  );
}
