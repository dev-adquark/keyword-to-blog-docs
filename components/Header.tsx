import Link from "next/link";
import { Button } from "./ui/Button";

export function Header() {
  return (
    <header className="border-b border-line bg-paper/95 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="font-display text-[17px] font-medium tracking-tight text-ink">
          Keyword&nbsp;<span className="text-indigo">&rarr;</span>&nbsp;Blog API
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          <Link href="/docs/quickstart" className="font-body text-[14px] text-muted hover:text-ink">
            Quickstart
          </Link>
          <Link href="/docs/api-reference" className="font-body text-[14px] text-muted hover:text-ink">
            API reference
          </Link>
          <Link href="/docs/billing-plans" className="font-body text-[14px] text-muted hover:text-ink">
            Pricing
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          <Button href="/docs/quickstart" variant="ghost" size="sm">
            Docs
          </Button>
          <Button href="/docs/quickstart#get-an-api-key" size="sm">
            Get API key
          </Button>
        </div>
      </div>
    </header>
  );
}
