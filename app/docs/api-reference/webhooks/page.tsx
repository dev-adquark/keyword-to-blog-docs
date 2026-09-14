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

// The header looks like: x-ktb-signature: t=1699999999,v1=<hex hmac>
function verifySignature(rawBody, signatureHeader, webhookSecret) {
  const match = /^t=(\\d+),v1=([a-f0-9]+)$/i.exec(signatureHeader.trim());
  if (!match) return false;
  const [, timestamp, provided] = match;

  // Reject stale signatures — protects against replayed deliveries.
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (ageSeconds > 5 * 60) return false;

  const signedPayload = \`\${timestamp}.\${rawBody}\`;
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  return (
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf)
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
          <li><span className="font-medium">x-ktb-signature</span> <span className="text-muted font-body">— {"`t=<unix timestamp>,v1=<HMAC-SHA256 hex digest>`"}, both in one header</span></li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Verifying a signature</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Parse the timestamp and digest out of the <code className="font-mono">x-ktb-signature</code> header,
          reject it if the timestamp is more than 5 minutes old, then concatenate the timestamp, a period, and
          the raw request body, compute an HMAC-SHA256 digest using your webhook&rsquo;s signing secret, and
          compare it to the provided digest using a constant-time comparison.
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
