import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Terms governing use of the Keyword-to-Blog API.",
  openGraph: {
    title: "Terms of service — Keyword-to-Blog API",
    description: "Terms governing use of the Keyword-to-Blog API.",
    type: "article",
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-prose px-6 py-16">
      <p className="font-mono text-xs text-indigo">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-medium text-ink">Terms of service</h1>
      <p className="mt-2 font-body text-sm text-muted">Last updated September 2026</p>

      <div className="mt-8 space-y-6 font-body text-[15px] leading-relaxed text-ink">
        <section>
          <h2 className="font-display text-lg font-medium text-ink">Use of the API</h2>
          <p className="mt-2 text-muted">
            You may use the Keyword-to-Blog API to generate blog content for your own products,
            clients, or internal pipelines, subject to your plan&rsquo;s rate limits and quotas described
            in <Link href="/docs/billing-plans" className="text-indigo underline underline-offset-2">Billing &amp; plans</Link>.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">API keys</h2>
          <p className="mt-2 text-muted">
            API keys are issued per account and must not be shared outside your organization or
            committed to public source control. You are responsible for all activity under your
            keys; rotate a key immediately if you believe it has been exposed.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Prohibited use</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
            <li>Generating content that is unlawful, defamatory, or infringes third-party rights.</li>
            <li>Attempting to exceed plan limits by circumventing metering or authentication.</li>
            <li>Reselling raw API access without a separate reseller agreement.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Content ownership</h2>
          <p className="mt-2 text-muted">
            You own the output generated from your requests. We claim no ownership over generated
            posts and do not use your request content to train models without separate consent.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Availability</h2>
          <p className="mt-2 text-muted">
            We aim for high availability but do not guarantee uninterrupted service. Scheduled
            maintenance and incidents are communicated through the status information on the
            homepage.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Termination</h2>
          <p className="mt-2 text-muted">
            Either party may terminate use of the API at any time. We may suspend keys that violate
            these terms or that we reasonably believe are being used for abuse.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Contact</h2>
          <p className="mt-2 text-muted">Questions about these terms can be sent to legal@keywordtoblog.dev.</p>
        </section>
      </div>
    </main>
  );
}
