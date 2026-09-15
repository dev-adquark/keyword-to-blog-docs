import type { MetadataRoute } from "next";
import { SITE_URL as siteUrl } from "@/lib/siteUrl";

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
  "/docs/examples",
  "/docs/versioning",
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
