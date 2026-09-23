import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Analytics } from "@/components/Analytics";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { SITE_URL as siteUrl } from "@/lib/siteUrl";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Keyword-to-Blog API — deterministic SEO blog generation",
    template: "%s — Keyword-to-Blog API",
  },
  description:
    "An API-first service that converts keywords and topics into SEO-formatted, schema-consistent long-form blog posts, with sync and async generation and webhooks.",
  icons: {
    icon: "/favicon-32x32.png",
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "Keyword-to-Blog API",
    description:
      "Convert keywords into SEO-formatted blog posts with a stable, versioned JSON schema built for pipeline automation.",
    type: "website",
    url: siteUrl,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-paper font-body text-ink antialiased">
        <Header />
        {children}
        <Footer />
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
