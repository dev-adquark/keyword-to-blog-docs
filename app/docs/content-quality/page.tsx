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
  { name: "Originality", detail: "Duplicate/near-duplicate sentences, duplicate headings, excessive verbatim phrase repetition — plus, for freshness-sensitive topics, excessive copying from the real source material itself." },
  { name: "Expert depth", detail: "Section length and concrete-detail markers (numbers, named specifics, examples, lists) — never word count alone." },
  { name: "SEO", detail: "Title, meta description, slug format, heading structure, and FAQ quality." },
  { name: "Keyword quality", detail: "Natural coverage of the primary keyword and related terms, and unnatural density (stuffing)." },
  { name: "Readability", detail: "Sentence/paragraph length, adjusted for the requested audience." },
  { name: "Structure", detail: "Section ordering and shape beyond what the JSON schema alone enforces." },
  { name: "Spam signals", detail: "Keyword-stuffed headings and pushy commercial language out of place in informational content." },
  { name: "Factuality", detail: "See below — standard vs. verified mode." },
  { name: "Freshness", detail: "See below — freshness-sensitive topics are grounded in real, retrieved news sources, not the model's own knowledge." },
];

export default function ContentQualityPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Content quality pipeline</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          The API never returns the first thing the model generates. Every request goes through one of two
          pipelines depending on the topic — see below — but both share the same principle: deterministic
          validation decides what&rsquo;s good enough, and Anthropic is used as sparingly as possible to get
          there.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Evergreen pipeline (most requests)</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Used for topics that aren&rsquo;t freshness-sensitive (see below). Never spends more than 2 Anthropic
          calls total.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 font-body text-[15px] text-muted">
          <li>A content brief and internal SEO plan are derived from your request (keywords, topic, audience) and folded into the generation prompt.</li>
          <li>The model generates a first draft — Anthropic call 1 of at most 2.</li>
          <li>Deterministic validators run across writing quality, originality, depth, SEO, keywords, readability, structure, spam signals, factuality, and freshness. If nothing fails, the response returns immediately.</li>
          <li>Anything mechanically fixable (slug format, a stray year in the title, clickbait phrasing, a too-short title, a generic/thin meta description, duplicate headings, weak FAQs, a keyword-stuffed heading) is corrected locally, in code, with zero extra AI calls — then re-validated. If that&rsquo;s enough, the response returns here.</li>
          <li>Only if a genuine semantic problem remains (writing quality, originality, depth, or keyword-density issues that require real rewriting) is ONE targeted repair call made — Anthropic call 2 of at most 2. It receives only the specific failed checks and returns a minimal patch of just the fields/sections that need to change, never the whole article rewritten from scratch.</li>
          <li>The patch is merged onto the existing post — everything not in the patch is preserved exactly — and validated again, followed by one more free mechanical cleanup pass.</li>
          <li>The request fails with <code className="font-mono">CONTENT_QUALITY_FAILED</code> only if a genuine, unresolved quality problem remains after this — never merely because a cosmetic/non-critical check is still imperfect, and never by silently lowering the bar.</li>
        </ol>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Source-grounded pipeline (freshness-sensitive topics)</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Used automatically for topics touching prices, software versions, laws, regulations, current
          statistics, or recent events (see below). Makes at most ONE Anthropic call — never a repair call — and
          can make zero Anthropic calls at all if no sufficient real source material is found.
        </p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 font-body text-[15px] text-muted">
          <li>Real news articles are retrieved from four independent providers (Currents API, NewsData.io, NewsAPI.org, and GDELT) in parallel. One provider failing, timing out, or being unavailable never blocks the others.</li>
          <li>Retrieved articles are normalized, deduplicated (identical/near-identical URLs and headlines collapse to one entry), and validated: published within the last 7 days with a real, parseable timestamp; genuinely relevant to the request (not just an incidental keyword match); meeting basic source-quality bars (a valid URL, a real title, real description/content text); and free of unresolved conflicts (sources covering the same story with contradicting figures are excluded rather than guessed between).</li>
          <li>If validation doesn&rsquo;t yield enough real, trustworthy evidence, retrieval retries with a broader query — up to 3 attempts total. The freshness window is never relaxed to force a pass. If all 3 attempts fail, the request fails with <code className="font-mono">SOURCE_VALIDATION_FAILED</code> and Anthropic is never called.</li>
          <li>Once validation passes, the approved source set is locked. Anthropic is called exactly once, purely as an editorial rewriter — it reads the locked evidence for factual grounding only and is instructed to write a completely fresh, independently-authored article: no copying or closely paraphrasing source sentences, no preserving a source&rsquo;s structure, and no naming sources/publishers in the prose by default. It is explicitly instructed never to add facts from its own memory.</li>
          <li>A source list is tracked internally, built deterministically from the locked source pack in code (never from text the model wrote), and used only to verify every claim traces back to real evidence. <strong>It is never published.</strong> The returned <code className="font-mono">post</code> and rendered markdown/HTML contain zero source URLs, markdown links, <code className="font-mono">&lt;a&gt;</code> tags, citation brackets, or a &ldquo;Sources&rdquo;/&ldquo;References&rdquo; section — the model is instructed never to write one, and a deterministic strip runs unconditionally on every generated post (evergreen and source-grounded alike) as a final safety layer regardless of what the model actually did.</li>
          <li>Deterministic validators then run once (the same categories as the evergreen pipeline, plus citation integrity, a source-originality check, and a hard backstop check that no link/citation markup survived). The source-originality check compares the article against the actual retrieved source text for excessive verbatim/near-verbatim overlap — copied sentences or closely paraphrased paragraphs are blocked — while ignoring the unavoidable overlap of names, companies, technical terms, and factually-required numbers/dates. If a genuine problem remains, the request fails with <code className="font-mono">CONTENT_QUALITY_FAILED</code> — there is no second Anthropic call to try to fix it.</li>
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
          verification of factual claims. For a freshness-sensitive topic (see below), this is honored for real —
          the request goes through the source-grounded pipeline, which retrieves and validates real news sources
          before generation, and the response is reported as genuinely <code className="font-mono">VERIFIED</code>.
          For a topic that isn&rsquo;t freshness-sensitive, there is no source-retrieval step to verify anything
          against, so rather than fabricate sources, citations, or statistics, the request fails honestly with{" "}
          <code className="font-mono">CONTENT_QUALITY_FAILED</code> instead.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Freshness-sensitive topics</h2>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Topics touching prices, software versions, laws, regulations, current statistics, or recent events are
          detected automatically and routed to the source-grounded pipeline described above. Anthropic is never
          the source of truth for what&rsquo;s current — real articles are retrieved from four independent news
          providers first, and only evidence that survives freshness, relevance, quality, deduplication, and
          conflict validation is ever shown to the model.
        </p>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Freshness is a rolling <strong>7-day window</strong>, not &ldquo;published today only&rdquo; — an
          article from three days ago is valid, current evidence, while a source with no parseable publication
          date, or one older than 7 days, is rejected outright and never counts toward the required evidence.
          When multiple sources cover the same underlying story but report contradicting figures or dates, that
          claim is excluded entirely rather than guessed between — the pipeline never merges or silently picks a
          side of a genuine conflict. A current-state claim in the final article is always backed by one of these
          verified sources; there is no fallback to the model&rsquo;s own training-data knowledge, and no repair
          call to patch things up if the initial evidence turns out to be insufficient. If sufficient real
          evidence can&rsquo;t be found after 3 retrieval attempts, the request fails with{" "}
          <code className="font-mono">SOURCE_VALIDATION_FAILED</code> — the model is never called at all in that
          case.
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
