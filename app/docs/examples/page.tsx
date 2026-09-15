import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { CodeBlock } from "@/components/CodeBlock";

export const metadata: Metadata = {
  title: "Examples",
  description: "Integration patterns: batch/agency workflows, a developer async pipeline, and JS/Python/curl clients.",
  openGraph: {
    title: "Examples — Keyword-to-Blog API",
    description: "Integration patterns: batch/agency workflows, a developer async pipeline, and JS/Python/curl clients.",
    type: "article",
    url: "/docs/examples",
  },
};

const agencyExample = `// Content-team batch workflow: submit several posts as async jobs so you
// never hold N connections open, then let webhooks tell you when each is done.
// There is no official SDK — this is plain fetch() against the real API.

const KEYWORD_TO_BLOG_API_KEY = process.env.KEYWORD_TO_BLOG_API_KEY;
const BASE_URL = process.env.KEYWORD_TO_BLOG_BASE_URL ?? "https://keyword-to-blog-docs.vercel.app";

const briefs = [
  { keywords: ["ai content marketing"], topic: "AI content marketing for agencies" },
  { keywords: ["seo for saas"], topic: "SEO fundamentals for SaaS teams" },
  { keywords: ["content calendar template"], topic: "Building a quarterly content calendar" },
];

async function submitBatch(briefs) {
  const jobs = [];
  for (const brief of briefs) {
    const res = await fetch(\`\${BASE_URL}/v1/jobs\`, {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${KEYWORD_TO_BLOG_API_KEY}\`,
        "Content-Type": "application/json",
        // One key per brief, derived deterministically, so re-running this
        // script after a partial failure never re-bills work already done.
        "Idempotency-Key": \`batch-\${brief.keywords[0]}\`,
      },
      body: JSON.stringify({
        generateRequest: {
          keywords: brief.keywords,
          topic: brief.topic,
          language: "en",
          tone: "professional",
          constraints: { maxWords: 1200, includeFAQs: true },
          format: { responseTypes: ["json", "markdown"] },
        },
        webhook: {
          url: "https://your-app.example.com/webhooks/keyword-to-blog",
          events: ["job.succeeded", "job.failed"],
        },
        format: { responseTypes: ["json", "markdown"] },
      }),
    });

    if (!res.ok) {
      const error = await res.json();
      console.error(\`Failed to queue "\${brief.topic}":\`, error.error.code, error.error.message);
      continue;
    }

    const job = await res.json();
    jobs.push(job);
    console.log(\`Queued \${job.jobId} for "\${brief.topic}" — status: \${job.status}\`);
  }
  return jobs;
}

await submitBatch(briefs);
// Each job's result now arrives at your webhook URL independently — see the
// "Developer pipeline" example below for verifying and handling that delivery.`;

const pipelineExample = `// Developer pipeline: your own queue enqueues work, calls this API
// asynchronously, and reacts to the signed webhook when a job finishes.
// Node.js, plain fetch()/crypto — no framework assumed.

import { createHmac, timingSafeEqual } from "node:crypto";

const KEYWORD_TO_BLOG_API_KEY = process.env.KEYWORD_TO_BLOG_API_KEY;
const BASE_URL = process.env.KEYWORD_TO_BLOG_BASE_URL ?? "https://keyword-to-blog-docs.vercel.app";

// 1. Your own worker picks up a task and calls this API.
async function createGenerationJob(task) {
  const res = await fetch(\`\${BASE_URL}/v1/jobs\`, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${KEYWORD_TO_BLOG_API_KEY}\`,
      "Content-Type": "application/json",
      "Idempotency-Key": task.id, // reuse YOUR task id as the idempotency key
    },
    body: JSON.stringify({
      generateRequest: task.generateRequest,
      webhook: { url: task.webhookUrl, events: ["job.succeeded", "job.failed"] },
      format: { responseTypes: ["json"] },
    }),
  });

  if (res.status === 429) {
    const { error } = await res.json();
    // RATE_LIMITED / QUOTA_EXCEEDED both carry Retry-After — respect it
    // instead of retrying immediately.
    const retryAfterSeconds = Number(res.headers.get("Retry-After") ?? "5");
    throw new Error(\`\${error.code}: retry after \${retryAfterSeconds}s\`);
  }
  if (!res.ok) {
    const { error } = await res.json();
    throw new Error(\`\${error.code}: \${error.message}\`);
  }
  return res.json(); // JobV1 — status is "queued" or already "succeeded"/"failed" if processed synchronously
}

// 2. Your webhook receiver verifies the signature before trusting the payload.
function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
  const match = /^t=(\\d+),v1=([a-f0-9]+)$/i.exec((signatureHeader ?? "").trim());
  if (!match) return false;
  const [, timestamp, provided] = match;

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (ageSeconds > 5 * 60) return false; // reject replayed/stale deliveries

  const expected = createHmac("sha256", webhookSecret)
    .update(\`\${timestamp}.\${rawBody}\`)
    .digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");
  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

// 3. Example receiver (e.g. inside an Express/Next.js route handler).
async function handleWebhook(req, webhookSecretForThisJob) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-ktb-signature");

  if (!verifyWebhookSignature(rawBody, signature, webhookSecretForThisJob)) {
    return new Response("invalid signature", { status: 401 });
  }

  const payload = JSON.parse(rawBody); // WebhookSucceededPayloadV1 | WebhookFailedPayloadV1
  if (payload.event === "job.succeeded") {
    await saveGeneratedPost(payload.jobId, payload.post, payload.rendered);
  } else {
    // payload.event === "job.failed" — payload.error.code is a normal ErrorCode
    await markTaskFailed(payload.jobId, payload.error);
  }
  return new Response("ok", { status: 200 });
}`;

const curlExample = `curl -X POST "$KEYWORD_TO_BLOG_BASE_URL/v1/generate" \\
  -H "Authorization: Bearer $KEYWORD_TO_BLOG_API_KEY" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -H "Content-Type: application/json" \\
  -d '{
    "keywords": ["ai content marketing"],
    "language": "en",
    "tone": "professional",
    "constraints": { "maxWords": 900 },
    "format": { "responseTypes": ["json", "markdown"] }
  }'`;

const jsExample = `const KEYWORD_TO_BLOG_API_KEY = process.env.KEYWORD_TO_BLOG_API_KEY;
const BASE_URL = process.env.KEYWORD_TO_BLOG_BASE_URL ?? "https://keyword-to-blog-docs.vercel.app";

const res = await fetch(\`\${BASE_URL}/v1/generate\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${KEYWORD_TO_BLOG_API_KEY}\`,
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
  },
  body: JSON.stringify({
    keywords: ["ai content marketing"],
    language: "en",
    tone: "professional",
    constraints: { maxWords: 900 },
    format: { responseTypes: ["json", "markdown"] },
  }),
});

if (!res.ok) {
  const { error } = await res.json();
  throw new Error(\`\${error.code}: \${error.message}\`);
}

const { post, rendered } = await res.json();
console.log(post.title, rendered.markdown);`;

const pythonExample = `import os
import uuid
import requests

API_KEY = os.environ["KEYWORD_TO_BLOG_API_KEY"]
BASE_URL = os.environ.get("KEYWORD_TO_BLOG_BASE_URL", "https://keyword-to-blog-docs.vercel.app")

response = requests.post(
    f"{BASE_URL}/v1/generate",
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Idempotency-Key": str(uuid.uuid4()),
    },
    json={
        "keywords": ["ai content marketing"],
        "language": "en",
        "tone": "professional",
        "constraints": {"maxWords": 900},
        "format": {"responseTypes": ["json", "markdown"]},
    },
    timeout=60,
)

if not response.ok:
    error = response.json()["error"]
    raise RuntimeError(f"{error['code']}: {error['message']}")

body = response.json()
print(body["post"]["title"])
print(body["rendered"]["markdown"])`;

export default function ExamplesPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Guides</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Examples</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          There is no official SDK package for this API today — every example below is plain{" "}
          <code className="font-mono">fetch</code>/<code className="font-mono">requests</code>/
          <code className="font-mono">curl</code> against the real <code className="font-mono">/v1</code>{" "}
          endpoints documented in the <a href="/docs/api-reference" className="text-indigo underline underline-offset-2">API reference</a>.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Agency / content-team batch workflow</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Submitting several briefs as async jobs (<code className="font-mono">POST /v1/jobs</code>) instead
          of holding several synchronous connections open, with a per-brief idempotency key so a re-run
          after a partial failure never bills the same brief twice.
        </p>
        <div className="mt-3">
          <CodeBlock filename="batch.js" code={agencyExample} />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Developer pipeline: queue → API → webhook</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Your own worker enqueues a job, then a webhook receiver verifies the signature (see{" "}
          <a href="/docs/api-reference/webhooks" className="text-indigo underline underline-offset-2">webhooks</a>)
          before trusting the payload — including rejecting a stale/replayed delivery.
        </p>
        <div className="mt-3">
          <CodeBlock filename="pipeline.js" code={pipelineExample} />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Single request — curl / JavaScript / Python</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          The same synchronous call in each of the three most common client contexts. Credentials always
          come from an environment variable, never a literal in code.
        </p>
        <div className="mt-3 space-y-3">
          <CodeBlock filename="curl" code={curlExample} />
          <CodeBlock filename="generate.js" code={jsExample} />
          <CodeBlock filename="generate.py" code={pythonExample} />
        </div>
      </div>
    </DocsPageShell>
  );
}
