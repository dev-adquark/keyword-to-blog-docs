export interface DocsNavItem {
  label: string;
  href: string;
}

export interface DocsNavSection {
  title: string;
  items: DocsNavItem[];
}

export const docsNav: DocsNavSection[] = [
  {
    title: "Getting started",
    items: [{ label: "Quickstart", href: "/docs/quickstart" }],
  },
  {
    title: "API reference",
    items: [
      { label: "Overview", href: "/docs/api-reference" },
      { label: "POST /v1/generate", href: "/docs/api-reference/generate" },
      { label: "POST /v1/jobs", href: "/docs/api-reference/jobs-create" },
      { label: "GET /v1/jobs/{jobId}", href: "/docs/api-reference/jobs-get" },
      { label: "GET /v1/usage", href: "/docs/api-reference/usage-get" },
      { label: "Webhooks", href: "/docs/api-reference/webhooks" },
    ],
  },
  {
    title: "Reference",
    items: [
      { label: "JSON schemas", href: "/docs/schemas" },
      { label: "SEO formatting guide", href: "/docs/seo-formatting-guide" },
      { label: "Content quality pipeline", href: "/docs/content-quality" },
      { label: "Billing & plans", href: "/docs/billing-plans" },
      { label: "Error codes", href: "/docs/error-codes" },
    ],
  },
];

export const footerLinks = {
  product: [
    { label: "Quickstart", href: "/docs/quickstart" },
    { label: "API reference", href: "/docs/api-reference" },
    { label: "Billing & plans", href: "/docs/billing-plans" },
  ],
  legal: [
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ],
};
