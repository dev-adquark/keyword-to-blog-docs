import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";

export const metadata: Metadata = {
  title: "Versioning & deprecation",
  description: "How /v1 stays stable, what counts as a breaking change, and how future versions ship.",
  openGraph: {
    title: "Versioning & deprecation — Keyword-to-Blog API",
    description: "How /v1 stays stable, what counts as a breaking change, and how future versions ship.",
    type: "article",
    url: "/docs/versioning",
  },
};

export default function VersioningPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Versioning &amp; deprecation</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          <code className="font-mono">/v1</code> is a stable public contract. Every response shape
          documented in <a href="/docs/schemas" className="text-indigo underline underline-offset-2">JSON schemas</a>{" "}
          is versioned by that <code className="font-mono">V1</code> suffix (<code className="font-mono">GenerateResponseV1</code>,{" "}
          <code className="font-mono">JobV1</code>, <code className="font-mono">UsageResponseV1</code>,{" "}
          <code className="font-mono">ErrorResponseV1</code>, <code className="font-mono">WebhookPayloadV1</code>) —
          the suffix is the version, not just a naming convention.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">What counts as non-breaking</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          These changes can ship to <code className="font-mono">/v1</code> at any time without a version bump:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 font-body text-[14px] text-muted">
          <li>Adding a new optional request field.</li>
          <li>Adding a new optional response field.</li>
          <li>Adding a new error code for a genuinely new failure mode.</li>
          <li>Loosening a validation constraint (e.g. raising a length limit).</li>
          <li>Adding a new endpoint.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">What counts as breaking</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          These require a new version (<code className="font-mono">/v2</code>) rather than an in-place change to{" "}
          <code className="font-mono">/v1</code>:
        </p>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 font-body text-[14px] text-muted">
          <li>Removing or renaming a request or response field.</li>
          <li>Changing a field&rsquo;s type or meaning.</li>
          <li>Making a previously-optional field required.</li>
          <li>Changing an error code&rsquo;s HTTP status mapping.</li>
          <li>Changing the webhook signature scheme or payload shape.</li>
          <li>Tightening a validation constraint in a way that would reject previously-valid requests.</li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Deprecation &amp; sunset</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          When a field or endpoint is deprecated, it keeps working — deprecation is an announcement, not
          an immediate removal. A deprecated field is documented as such here and continues to be
          populated/accepted for a minimum communicated notice period before removal in a subsequent major
          version. Sunset timelines and migration guidance for any deprecated surface are published on
          this page and, where practical, surfaced via response headers on the affected endpoint.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Today</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          There is currently no <code className="font-mono">/v2</code> and nothing on{" "}
          <code className="font-mono">/v1</code> is deprecated. This page exists so that changes, when
          they do happen, have a clear, pre-established policy to follow rather than being decided
          ad hoc.
        </p>
      </div>
    </DocsPageShell>
  );
}
