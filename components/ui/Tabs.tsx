"use client";

import * as React from "react";
import clsx from "clsx";

export function Tabs({
  tabs,
  defaultTab,
}: {
  tabs: Array<{ label: string; content: React.ReactNode }>;
  defaultTab?: number;
}) {
  const [active, setActive] = React.useState(defaultTab ?? 0);

  return (
    <div>
      <div role="tablist" className="flex gap-1 border-b border-line">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            role="tab"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            className={clsx(
              "font-mono text-xs px-3 py-2 -mb-px border-b-2 transition-colors",
              active === i
                ? "border-indigo text-ink"
                : "border-transparent text-muted hover:text-ink"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="pt-4">{tabs[active]?.content}</div>
    </div>
  );
}
