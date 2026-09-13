"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { docsNav } from "@/lib/docsContent";

export function DocsPageShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-10 md:grid-cols-[220px_1fr]">
      <aside className="hidden md:block">
        <nav className="sticky top-24 space-y-6">
          {docsNav.map((section) => (
            <div key={section.title}>
              <p className="mb-2 font-mono text-xs text-muted">{section.title}</p>
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={clsx(
                          "block rounded-md px-2.5 py-1.5 text-[14px] font-body transition-colors",
                          active
                            ? "bg-indigo-soft text-indigo-dark font-medium"
                            : "text-muted hover:bg-surface hover:text-ink"
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
