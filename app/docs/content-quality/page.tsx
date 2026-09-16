import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { JsonBlock } from "@/components/JsonBlock";
import { errorContentQualityFailedExample } from "@/lib/examples/usage-and-errors";
import { generateResponseExample } from "@/lib/examples/generate-response";

export const metadata: Metadata = {
  title: "Content quality pipeline",
  description: "How every generated post is validated, automatically revised, and gated before it's ever returned.",
  openGraph: {
    title: "Content quality pipeline — Keyword-to-Blog API",
    description: "How every generated post is validated, automatically revised, and gated before it's ever returned.",
    type: "article",
    url: "/docs/content-quality",
  },
};

const CHECK_CATEGORIES = [
  { name: "Writing quality", detail: "Generic openings/closings, filler phrases, repetitive sentence structure or starters." },
  { name: "Originality", detail: "Duplicate/near-duplicate sentences, duplicate headings, excessive verbatim phrase repetition." },
  { name: "Expert depth", detail: "Section length and concrete-detail markers (numbers, named specifics, examples, lists) — never word count alone." },
  { name: "SEO", detail: "Title, meta description, slug format, heading structure, and FAQ quality." },
  { name: "Keyword quality", detail: "Natural coverage of the primary keyword and related terms, and unnatural density (stuffing)." },
  { name: "Readability", detail: "Sentence/paragraph length, adjusted for the requested audience." },
  { name: "Structure", detail: "Section ordering and shape beyond what the JSON schema alone enforces." },
  { name: "Spam signals", detail: "Keyword-stuffed headings and pushy commercial language out of place in informational content." },
  { name: "Factuality", detail: "See below — standard vs. verified mode." },
  { name: "Freshness", detail: "See below — detects freshness-sensitive topics." },
];

export default function ContentQualityPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Content quality pipeline</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          The API never returns the first thing the model generates, but it also never spends more than one
          extra AI call fixing it. Every request — synchronous or async — goes through the same pipeline:
          generate once, validate deterministically, fix anything mechanically fixable for free, validate again,
          and only spend one targeted AI repair call if a genuine semantic problem remains. A request never makes
          more than 2 Anthropic calls total.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Pipeline flow</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 font-body text-[15px] text-muted">
          <li>A content brief and internal SEO plan are derived from your request (keywords, topic, audience) and folded into the generation prompt.</li>
          <li>The model generates a first draft — Anthropic call 1 of at most 2.</li>
          <li>Deterministic validators run across writing quality, originality, depth, SEO, keywords, readability, structure, spam signals, factuality, and freshness. If nothing fails, the response returns immediately.</li>
          <li>Anything mechanically fixable (slug format, a stray year in the title, clickbait phrasing, a too-short title, a generic/thin meta description, duplicate headings, weak FAQs, a keyword-stuffed heading) is corrected locally, in code, with zero extra AI calls — then re-validated. If that&rsquo;s enough, the response returns here.</li>
          <li>Only if a genuine semantic problem remains (writing quality, originality, depth, or keyword-density issues that require real rewriting) is ONE targeted repair call made — Anthropic call 2 of at most 2. It receives only the specific failed checks and returns a minimal patch of just the fields/sections that need to change, never the whole article rewritten from scratch.</li>
          <li>The patch is merged onto the existing post — everything not in the patch is preserved exactly — and validated again, followed by one more free mechanical cleanup pass.</li>
          <li>The request fails with <code className="font-mono">CONTENT_QUALITY_FAILED</code> only if a genuine, unresolved quality problem remains after this — never merely because a cosmetic/non-critical check is still imperfect, and never by silently lowering the bar.</li>
        </ol>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">What gets checked</h2>
        <Table>
          <Thead>
            <Tr><Th>Category</Th><Th>What it looks for</Th></Tr>
          </Thead>
          <tbody>
            {CHECK_CATEGORIES.map((c) => (
              <Tr key={c.name}>
                <Td className="font-mono">{c.name}</Td>
                <Td>{c.detail}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-3 font-body text-[14px] text-muted">
          This is a quality/pattern-detection system, not an &ldquo;AI detector&rdquo; — it never reports an
          AI-probability score or claims content is undetectable as AI-written. It reports concrete, explainable
          signals (repetition, phrase frequency, structural shape) instead.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Factuality: standard vs. verified</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          By default (<code className="font-mono">factualityMode: &quot;standard&quot;</code>, or the field
          omitted entirely), content is generated from the model&rsquo;s own knowledge. It is checked for internal
          consistency, but the API never claims external facts were independently verified.
        </p>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Setting <code className="font-mono">factualityMode: &quot;verified&quot;</code> requests source-backed
          verification of factual claims. This deployment has no source-retrieval capability, so rather than
          fabricate sources, citations, or statistics, a <code className="font-mono">&quot;verified&quot;</code>{" "}
          request currently fails with <code className="font-mono">CONTENT_QUALITY_FAILED</code>. Use standard mode
          unless you have an external fact-checking step of your own downstream.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Freshness-sensitive topics</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Topics touching prices, software versions, laws, regulations, or current statistics are detected
          automatically. The pipeline never invents &ldquo;the latest&rdquo; information — it asks for hedged,
          general-guidance phrasing instead of unqualified current-state claims. Combined with{" "}
          <code className="font-mono">factualityMode: &quot;verified&quot;</code>, an unqualified current-state
          claim on a freshness-sensitive topic blocks the response instead.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">What you see in the response</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Every successful response (sync, job polling, and the <code className="font-mono">job.succeeded</code>{" "}
          webhook) includes a minimal <code className="font-mono">quality</code> summary — the full internal
          scoring breakdown is intentionally not part of the public contract:
        </p>
        <div className="mt-3">
          <JsonBlock data={{ quality: generateResponseExample.quality }} filename="quality summary" />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">When it can&rsquo;t be fixed</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          If a genuine problem remains after the deterministic pass and the one repair call, the request fails
          instead of returning substandard content. <code className="font-mono">details.failedCheckCodes</code>{" "}
          lists which internal checks were still failing — see{" "}
          <a href="/docs/error-codes" className="text-indigo hover:underline">error codes</a> for the full list.
        </p>
        <div className="mt-3">
          <JsonBlock data={errorContentQualityFailedExample} filename="422" />
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Sync vs. async behavior</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          <code className="font-mono">POST /v1/generate</code> runs the full pipeline inline and returns{" "}
          <code className="font-mono">CONTENT_QUALITY_FAILED</code> as an HTTP 422 if it can&rsquo;t pass.{" "}
          <code className="font-mono">POST /v1/jobs</code> runs the identical pipeline in the background; a job
          that can&rsquo;t pass ends in <code className="font-mono">status: &quot;failed&quot;</code> with the same
          error code in <code className="font-mono">job.error</code>, and the same information in a{" "}
          <code className="font-mono">job.failed</code> webhook if one is configured. Usage metering and rate
          limits apply the same way regardless of whether the pipeline needed its one repair call — you are
          billed for the one request you made, not for internal fix attempts.
        </p>
      </div>
    </DocsPageShell>
  );
}
