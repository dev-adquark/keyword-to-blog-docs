import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_API_BASE_URL
  ? process.env.NEXT_PUBLIC_API_BASE_URL.replace("api.", "")
  : "https://keywordtoblog.dev";

const routes = [
  "",
  "/docs/quickstart",
  "/docs/api-reference",
  "/docs/api-reference/generate",
  "/docs/api-reference/jobs-create",
  "/docs/api-reference/jobs-get",
  "/docs/api-reference/usage-get",
  "/docs/api-reference/webhooks",
  "/docs/schemas",
  "/docs/seo-formatting-guide",
  "/docs/billing-plans",
  "/docs/error-codes",
  "/privacy",
  "/terms",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: route === "" ? 1 : 0.6,
  }));
}
