/**
 * Public site origin used for SEO (robots.txt, sitemap.xml, canonical/OG URLs,
 * JSON-LD). Falls back to the real production domain — never a placeholder
 * that doesn't belong to this deployment — so metadata is correct even if
 * NEXT_PUBLIC_API_BASE_URL is left unset.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "https://keyword-to-blog-docs.vercel.app";
