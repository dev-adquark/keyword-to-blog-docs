/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  agentRules: false,
  async rewrites() {
    return [
      // The docs' curl examples call POST /v1/generate (no /api prefix), but
      // the Next.js App Router file lives at app/api/v1/generate/route.ts,
      // so that bare path has never had a matching route — it 404s before
      // reaching any app code. This transparently maps the request to the
      // real, unmodified route (same auth/validation/generation/quota/
      // idempotency/response-code path) rather than duplicating or
      // rewriting any handler logic.
      { source: "/v1/generate", destination: "/api/v1/generate" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
