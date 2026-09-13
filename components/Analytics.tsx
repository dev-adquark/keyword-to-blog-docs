import Script from "next/script";

/**
 * Deterministic gating: this component renders nothing at all — no script
 * tag is emitted into the HTML, so no network call can occur — unless
 * NEXT_PUBLIC_ANALYTICS_ID is set at build time. This is checkable directly
 * in the rendered output (view source: no <script data-analytics> tag when
 * the env var is absent).
 */
export function Analytics() {
  const analyticsId = process.env.NEXT_PUBLIC_ANALYTICS_ID;
  if (!analyticsId) return null;

  return (
    <Script
      id="analytics"
      data-analytics={analyticsId}
      strategy="afterInteractive"
      src={`https://plausible.io/js/script.js`}
      data-domain={analyticsId}
    />
  );
}
