import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Keyword-to-Blog API — deterministic SEO blog generation",
  description:
    "An API-first service that converts keywords and topics into SEO-formatted, schema-consistent long-form blog posts, with sync and async generation and webhooks.",
  openGraph: {
    title: "Keyword-to-Blog API",
    description:
      "Convert keywords into SEO-formatted blog posts with a stable, versioned JSON schema built for pipeline automation.",
    type: "website",
    url: "/",
  },
};

const features = [
  {
    title: "API-first schema",
    body: "Every post comes back as a stable, versioned JSON structure — title, outline, sections, FAQs — not a blob of prose to re-parse.",
  },
  {
    title: "Sync and async",
    body: "Call POST /v1/generate for an immediate response, or POST /v1/jobs when you'd rather poll or get a webhook.",
  },
  {
    title: "Webhooks",
    body: "job.succeeded and job.failed events, signed with HMAC-SHA256, delivered to your own endpoint.",
  },
  {
    title: "Metering built in",
    body: "Word- and post-level usage tracking per plan, visible through GET /v1/usage before you ever hit a quota wall.",
  },
];

function buildTimeLabel() {
  const raw = process.env.NEXT_PUBLIC_BUILD_TIME;
  if (!raw) return "unknown";
  try {
    return new Date(raw).toISOString();
  } catch {
    return raw;
  }
}

export default function HomePage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Keyword-to-Blog API",
    url: "https://keywordtoblog.dev",
    description:
      "An API-first service that converts keywords and topics into SEO-formatted, schema-consistent long-form blog posts.",
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <section className="mx-auto max-w-6xl px-6 pb-16 pt-20">
        <div className="max-w-2xl">
          <p className="font-mono text-xs text-indigo">v1 · JSON schema</p>
          <h1 className="mt-4 font-display text-[2.75rem] font-medium leading-[1.1] tracking-tight text-ink sm:text-5xl">
            Turn keywords into structured blog posts your pipeline can trust
          </h1>
          <p className="mt-5 max-w-prose font-body text-[17px] leading-relaxed text-muted">
            Keyword-to-Blog API converts a list of keywords into a deterministic,
            SEO-formatted JSON post — title, outline, sections, FAQs, and meta —
            so your content pipeline never has to guess at the shape of the output.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/docs/quickstart">Start in 15 minutes</Button>
            <Button href="/docs/api-reference" variant="secondary">
              Browse API reference
            </Button>
          </div>
        </div>
      </section>

      <section className="border-t border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <h2 className="font-display text-xl font-medium text-ink">Built for automation, not a blog editor</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {features.map((f) => (
              <Card key={f.title}>
                <CardBody>
                  <h3 className="font-display text-[15px] font-medium text-ink">{f.title}</h3>
                  <p className="mt-1.5 font-body text-[14px] leading-relaxed text-muted">{f.body}</p>
                </CardBody>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <h2 className="font-display text-xl font-medium text-ink">Status</h2>
        <Card className="mt-4 max-w-md">
          <CardBody className="flex items-center justify-between">
            <div>
              <p className="font-body text-[14px] text-muted">Last deployment build</p>
              <p className="mt-1 font-mono text-sm text-ink">{buildTimeLabel()}</p>
            </div>
            <Badge tone="green">operational</Badge>
          </CardBody>
        </Card>
      </section>
    </main>
  );
}
