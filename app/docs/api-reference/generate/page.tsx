import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { EndpointCard } from "@/components/EndpointCard";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonBlock } from "@/components/JsonBlock";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { generateRequestExample } from "@/lib/examples/generate-request";
import { generateResponseExample } from "@/lib/examples/generate-response";

export const metadata: Metadata = {
  title: "POST /v1/generate",
  description: "Synchronous SEO blog post generation endpoint reference.",
  openGraph: {
    title: "POST /v1/generate — Keyword-to-Blog API",
    description: "Synchronous SEO blog post generation endpoint reference.",
    type: "article",
    url: "/docs/api-reference/generate",
  },
};

const baseUrl = "${NEXT_PUBLIC_API_BASE_URL}";

export default function GenerateEndpointPage() {
  const curl = `curl -X POST ${baseUrl}/v1/generate \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY" \\
  -H "Idempotency-Key: 3f7c2e9a-1d4b-4e2a-9c3d-8b1a2f4e5c6d" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(generateRequestExample, null, 2)}'`;

  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">API reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">POST /v1/generate</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Generates a single SEO-formatted blog post synchronously and returns it in the response body.
        </p>

        <div className="mt-8">
          <EndpointCard
            method="POST"
            path="/v1/generate"
            headers={[
              { name: "Authorization", value: "Bearer <API_KEY>", required: true },
              { name: "Idempotency-Key", value: "<uuid>" },
              { name: "X-Request-ID", value: "<uuid>" },
            ]}
          >
            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Request body fields</h3>
              <Table>
                <Thead>
                  <Tr>
                    <Th>Field</Th>
                    <Th>Type</Th>
                    <Th>Notes</Th>
                  </Tr>
                </Thead>
                <tbody>
                  <Tr><Td className="font-mono">keywords</Td><Td className="font-mono">{`string[]`}</Td><Td>At least 1 keyword required.</Td></Tr>
                  <Tr><Td className="font-mono">topic</Td><Td className="font-mono">{`string?`}</Td><Td>Optional framing for the post beyond the raw keywords.</Td></Tr>
                  <Tr><Td className="font-mono">language</Td><Td className="font-mono">string</Td><Td>e.g. {`"en"`}.</Td></Tr>
                  <Tr><Td className="font-mono">tone</Td><Td className="font-mono">{`"professional" | "friendly" | "bold"`}</Td><Td>Must match one of the supported enum values.</Td></Tr>
                  <Tr><Td className="font-mono">constraints.maxWords</Td><Td className="font-mono">number</Td><Td>Capped by your plan&rsquo;s maxWordsPerRequest — see billing & plans.</Td></Tr>
                  <Tr><Td className="font-mono">format.responseTypes</Td><Td className="font-mono">{`Array<"json"|"markdown"|"html">`}</Td><Td>Controls which representations appear under rendered.</Td></Tr>
                  <Tr><Td className="font-mono">factualityMode</Td><Td className="font-mono">{`"standard" | "verified"`}</Td><Td>Optional, defaults to <code className="font-mono">&quot;standard&quot;</code> — see the <a href="/docs/content-quality" className="text-indigo hover:underline">content quality pipeline</a>.</Td></Tr>
                </tbody>
              </Table>
              <p className="mt-2 font-body text-[13px] text-muted">
                Full field list: see <code className="font-mono">GenerateRequestV1</code> in{" "}
                <code className="font-mono">lib/types/Generate.ts</code>.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Content quality pipeline</h3>
              <p className="font-body text-[14px] text-muted">
                The response is never the model&rsquo;s raw first draft — every generation is validated and,
                if needed, automatically revised by the{" "}
                <a href="/docs/content-quality" className="text-indigo hover:underline">content quality pipeline</a>{" "}
                before being returned. If it still can&rsquo;t pass within the revision limit, the request fails
                with <code className="font-mono">CONTENT_QUALITY_FAILED</code> instead of returning substandard
                content.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Prohibited input constraints</h3>
              <p className="font-body text-[14px] text-muted">
                If the model declines to generate content for a request (its own safety system refuses),
                the request fails with <code className="font-mono">PROHIBITED_INPUT</code> instead of
                returning partial or fabricated content — see{" "}
                <code className="font-mono">/docs/error-codes</code>.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Idempotency</h3>
              <p className="font-body text-[14px] text-muted">
                Pass a key via the <code className="font-mono">Idempotency-Key</code> header or the body&rsquo;s{" "}
                <code className="font-mono">idempotencyKey</code> field. The same key with the same request
                body returns the original response again — generation only ever runs once, so retries after
                a dropped connection can&rsquo;t double-bill. Reusing the same key with a different body
                returns <code className="font-mono">VALIDATION_ERROR</code>.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Response schema</h3>
              <p className="font-body text-[14px] text-muted">
                <code className="font-mono">requestId</code>, <code className="font-mono">post</code> (the{" "}
                <code className="font-mono">SEOPostV1</code> object), <code className="font-mono">rendered</code>{" "}
                (markdown/html/rawJson per requested <code className="font-mono">format.responseTypes</code>), an
                optional <code className="font-mono">debug</code> block, and{" "}
                <code className="font-mono">quality</code> — a minimal summary from the{" "}
                <a href="/docs/content-quality" className="text-indigo hover:underline">content quality pipeline</a>{" "}
                (score, revision count); the full internal scoring breakdown is intentionally not part of the
                public response.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">curl example</h3>
              <CodeBlock filename="shell" code={curl} />
            </div>

            <div>
              <h3 className="mb-2 font-display text-sm font-medium text-ink">Example response — 200 OK</h3>
              <JsonBlock data={generateResponseExample} />
            </div>
          </EndpointCard>
        </div>
      </div>
    </DocsPageShell>
  );
}
