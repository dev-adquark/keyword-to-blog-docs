import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Keyword-to-Blog API collects, uses, and retains data.",
  openGraph: {
    title: "Privacy policy — Keyword-to-Blog API",
    description: "How Keyword-to-Blog API collects, uses, and retains data.",
    type: "article",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-prose px-6 py-16">
      <p className="font-mono text-xs text-indigo">Legal</p>
      <h1 className="mt-2 font-display text-3xl font-medium text-ink">Privacy policy</h1>
      <p className="mt-2 font-body text-sm text-muted">Last updated September 2026</p>

      <div className="mt-8 space-y-6 font-body text-[15px] leading-relaxed text-ink">
        <section>
          <h2 className="font-display text-lg font-medium text-ink">What we collect</h2>
          <p className="mt-2 text-muted">
            When you use the Keyword-to-Blog API, we process the request content you send us
            (keywords, topics, and any brand voice or audience details you include), account and
            billing information tied to your API key, and operational logs (timestamps, endpoint
            called, response status, request ID) needed to run and debug the service.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">How we use it</h2>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted">
            <li>To generate the blog post content your request asked for.</li>
            <li>To meter usage against your plan's word and request quotas.</li>
            <li>To deliver webhook events to the URL you configured.</li>
            <li>To investigate abuse, debug failures, and maintain service reliability.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Retention</h2>
          <p className="mt-2 text-muted">
            Generated post content and request payloads are retained for 30 days to support job
            polling and support requests, then deleted. Billing and usage records are retained for
            as long as required for accounting and tax purposes.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Sharing</h2>
          <p className="mt-2 text-muted">
            We do not sell request content or account data. Data may be shared with infrastructure
            subprocessors (hosting, database, and model providers) strictly to operate the service,
            under contractual confidentiality terms.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Your controls</h2>
          <p className="mt-2 text-muted">
            You can request deletion of your account data, export your usage history, or rotate/revoke
            API keys at any time from your account settings.
          </p>
        </section>

        <section>
          <h2 className="font-display text-lg font-medium text-ink">Contact</h2>
          <p className="mt-2 text-muted">
            Questions about this policy can be sent to privacy@keywordtoblog.dev.
          </p>
        </section>
      </div>
    </main>
  );
}
