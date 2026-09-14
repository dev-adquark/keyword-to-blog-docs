import { Button } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col items-start px-6 py-28">
      <p className="font-mono text-xs text-indigo">404</p>
      <h1 className="mt-4 font-display text-3xl font-medium text-ink">This page doesn&rsquo;t exist</h1>
      <p className="mt-3 max-w-prose font-body text-[15px] text-muted">
        The route you requested isn&rsquo;t part of the Keyword-to-Blog API docs. Check the URL, or head
        back to the quickstart to find your way.
      </p>
      <div className="mt-7">
        <Button href="/docs/quickstart">Go to quickstart</Button>
      </div>
    </main>
  );
}
