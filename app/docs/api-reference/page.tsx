import type { Metadata } from "next";
import Link from "next/link";
import { DocsPageShell } from "@/components/DocsPageShell";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "API reference",
  description: "Index of every Keyword-to-Blog API endpoint.",
  openGraph: {
    title: "API reference — Keyword-to-Blog API",
    description: "Index of every Keyword-to-Blog API endpoint.",
    type: "article",
    url: "/docs/api-reference",
  },
};

const endpoints = [
  { method: "POST", path: "/v1/generate", href: "/docs/api-reference/generate", desc: "Synchronous post generation." },
  { method: "POST", path: "/v1/jobs", href: "/docs/api-reference/jobs-create", desc: "Create an asynchronous generation job." },
  { method: "GET", path: "/v1/jobs/{jobId}", href: "/docs/api-reference/jobs-get", desc: "Poll a job's status and result." },
  { method: "GET", path: "/v1/usage", href: "/docs/api-reference/usage-get", desc: "Metered usage for the current billing period." },
  { method: "—", path: "Webhooks", href: "/docs/api-reference/webhooks", desc: "Payload schema and signature verification." },
] as const;

export default function ApiReferenceIndexPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">API reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Endpoints</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Every endpoint returns the same versioned JSON shapes described in{" "}
          <Link href="/docs/schemas" className="text-indigo underline underline-offset-2">
            JSON schemas
          </Link>
          .
        </p>

        <div className="mt-8 space-y-3">
          {endpoints.map((e) => (
            <Link key={e.href} href={e.href}>
              <Card className="transition-colors hover:border-indigo">
                <CardBody className="flex items-center gap-4">
                  {e.method !== "—" && <Badge tone={e.method === "GET" ? "indigo" : "green"}>{e.method}</Badge>}
                  <div>
                    <p className="font-mono text-sm text-ink">{e.path}</p>
                    <p className="mt-0.5 font-body text-[13px] text-muted">{e.desc}</p>
                  </div>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </DocsPageShell>
  );
}
