import Link from "next/link";
import { footerLinks } from "@/lib/docsContent";

export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <p className="font-display text-[15px] font-medium text-ink">Keyword &rarr; Blog API</p>
            <p className="mt-2 max-w-[26ch] font-body text-[13px] text-muted">
              Deterministic, schema-first blog generation for teams who automate content in pipelines.
            </p>
          </div>
          <div>
            <p className="mb-3 font-mono text-xs text-muted">Product</p>
            <ul className="space-y-2">
              {footerLinks.product.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="font-body text-[14px] text-muted hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 font-mono text-xs text-muted">Legal</p>
            <ul className="space-y-2">
              {footerLinks.legal.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="font-body text-[14px] text-muted hover:text-ink">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-10 font-mono text-xs text-muted">
          &copy; {new Date().getFullYear()} Keyword-to-Blog API.
        </p>
      </div>
    </footer>
  );
}
