import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { CodeBlock } from "@/components/CodeBlock";
import { JsonBlock } from "@/components/JsonBlock";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { webhookSuccessPayloadExample, webhookFailedPayloadExample } from "@/lib/examples/jobs-fixtures";

export const metadata: Metadata = {
  title: "Webhooks",
  description: "Webhook delivery events, payload schema, and signature verification.",
  openGraph: {
    title: "Webhooks — Keyword-to-Blog API",
    description: "Webhook delivery events, payload schema, and signature verification.",
    type: "article",
    url: "/docs/api-reference/webhooks",
  },
};

const verifyExample = `const crypto = require("crypto");

function verifySignature(rawBody, signatureHeader, timestampHeader, webhookSecret) {
  const signedPayload = \`\${timestampHeader}.\${rawBody}\`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signatureHeader)
  );
}`;

export default function WebhooksPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">API reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Webhooks</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Jobs created via POST /v1/jobs deliver their result to the webhook URL you configured,
          instead of (or in addition to) polling.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Events</h2>
        <Table>
          <Thead>
            <Tr><Th>Event</Th><Th>Fired when</Th></Tr>
          </Thead>
          <tbody>
            <Tr><Td className="font-mono">job.succeeded</Td><Td>The job finished generating and result content is ready.</Td></Tr>
            <Tr><Td className="font-mono">job.failed</Td><Td>The job could not complete — see the error object in the payload.</Td></Tr>
          </tbody>
        </Table>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Headers</h2>
        <ul className="mt-3 space-y-1.5 font-mono text-[13px] text-ink">
          <li><span className="font-medium">X-KeywordToBlog-Signature</span> <span className="text-muted font-body">— HMAC-SHA256 hex digest</span></li>
          <li><span className="font-medium">X-KeywordToBlog-Timestamp</span> <span className="text-muted font-body">— Unix timestamp, used in the signed payload to prevent replay</span></li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Verifying a signature</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Concatenate the timestamp header, a period, and the raw request body, then compute an
          HMAC-SHA256 digest using your webhook&rsquo;s signing secret and compare it to the signature
          header using a constant-time comparison.
        </p>
        <div className="mt-4">
          <CodeBlock filename="verify.js" code={verifyExample} />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Payload — job.succeeded</h2>
        <div className="mt-3">
          <JsonBlock data={webhookSuccessPayloadExample} />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Payload — job.failed</h2>
        <div className="mt-3">
          <JsonBlock data={webhookFailedPayloadExample} />
        </div>
      </div>
    </DocsPageShell>
  );
}
