import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { JsonBlock } from "@/components/JsonBlock";
import { generateResponseExample } from "@/lib/examples/generate-response";

export const metadata: Metadata = {
  title: "SEO formatting guide",
  description: "The deterministic structure of every generated post and how constraints shape it.",
  openGraph: {
    title: "SEO formatting guide — Keyword-to-Blog API",
    description: "The deterministic structure of every generated post and how constraints shape it.",
    type: "article",
    url: "/docs/seo-formatting-guide",
  },
};

export default function SeoFormattingGuidePage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">SEO formatting guide</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Every generated post follows the same deterministic structure, so downstream templates
          and CMS imports don't have to special-case the output.
        </p>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Field-by-field structure</h2>
        <Table>
          <Thead>
            <Tr><Th>Field</Th><Th>Purpose</Th></Tr>
          </Thead>
          <tbody>
            <Tr><Td className="font-mono">title</Td><Td>Human-readable headline, also used as the H1 in outline.h1.</Td></Tr>
            <Tr><Td className="font-mono">slugSuggestion</Td><Td>URL-safe slug derived from the title and primary keyword.</Td></Tr>
            <Tr><Td className="font-mono">meta.description</Td><Td>Search-result meta description, kept under ~160 characters.</Td></Tr>
            <Tr><Td className="font-mono">meta.primaryKeyword</Td><Td>The single keyword the post is optimized around.</Td></Tr>
            <Tr><Td className="font-mono">outline.h1 / outline.h2</Td><Td>The heading hierarchy, generated before section content to keep structure consistent.</Td></Tr>
            <Tr><Td className="font-mono">sections</Td><Td>Ordered array of typed blocks: introduction, body, faq, conclusion, or callout.</Td></Tr>
            <Tr><Td className="font-mono">faqs</Td><Td>Present only when constraints.includeFAQs is true.</Td></Tr>
            <Tr><Td className="font-mono">conclusion</Td><Td>Closing section, duplicated from the final "conclusion"-type section for convenience.</Td></Tr>
            <Tr><Td className="font-mono">coverageNotes.keywordCoverage</Td><Td>Per-keyword evidence of where and whether it was actually used.</Td></Tr>
          </tbody>
        </Table>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Determinism rules</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-[15px] text-muted">
          <li>
            <span className="text-ink">Headings are generated before body content.</span> The
            outline is fixed first from the keywords and{" "}
            <code className="font-mono">constraints.maxSections</code>, then each section is written
            to match its own heading — headings never get rewritten to fit the body.
          </li>
          <li>
            <span className="text-ink">tone</span> affects sentence-level phrasing in{" "}
            <code className="font-mono">contentMarkdown</code> only — it never changes{" "}
            <code className="font-mono">meta.description</code> wording style, which stays
            search-intent-first regardless of tone.
          </li>
          <li>
            <span className="text-ink">region</span> affects spelling/units (e.g. "colour" vs
            "color") and locally relevant examples, but not the JSON structure itself.
          </li>
          <li>
            <span className="text-ink">language</span> affects every text field's language, but
            field names and structure remain identical across all languages.
          </li>
        </ul>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Complete example</h2>
        <p className="mt-3 font-body text-[15px] text-muted">
          A full <code className="font-mono">SEOPostV1</code> object with every field populated:
        </p>
        <div className="mt-3">
          <JsonBlock data={generateResponseExample.post} filename="SEOPostV1" />
        </div>
      </div>
    </DocsPageShell>
  );
}
