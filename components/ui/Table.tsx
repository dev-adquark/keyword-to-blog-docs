import * as React from "react";
import clsx from "clsx";

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return <thead className="bg-surface font-mono text-xs uppercase-none text-muted">{children}</thead>;
}

export function Tr({ children }: { children: React.ReactNode }) {
  return <tr className="border-t border-line first:border-t-0">{children}</tr>;
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={clsx("px-4 py-2.5 font-mono text-xs font-medium text-muted", className)}>{children}</th>;
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={clsx("px-4 py-2.5 align-top font-body text-[14px] text-ink", className)}>{children}</td>;
}
