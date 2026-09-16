import Link from "next/link";
import { getCurrentSession } from "@/lib/server/auth";
import { LogoutButton } from "@/components/LogoutButton";

const NAV = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/api-keys", label: "API Keys" },
  { href: "/dashboard/usage", label: "Usage" },
  { href: "/dashboard/access", label: "Plan & access" },
];

const OWNER_NAV = [
  { href: "/dashboard/team", label: "Team" },
  { href: "/dashboard/audit", label: "Audit log" },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  const isOwner = session?.user.role === "OWNER";
  const nav = isOwner ? [...NAV, ...OWNER_NAV] : NAV;

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-[192px_1fr]">
      <aside className="md:w-48 md:shrink-0">
        <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-[14px] text-ink hover:bg-surface"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/docs/quickstart"
            className="rounded-md px-3 py-2 text-[14px] text-muted hover:bg-surface"
          >
            API docs
          </Link>
        </nav>
        <div className="mt-6 border-t border-line pt-4">
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
