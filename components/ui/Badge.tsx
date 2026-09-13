import * as React from "react";
import clsx from "clsx";

type Tone = "indigo" | "amber" | "neutral" | "green" | "red";

const tones: Record<Tone, string> = {
  indigo: "bg-indigo-soft text-indigo-dark",
  amber: "bg-amber-soft text-amber",
  neutral: "bg-surface text-muted",
  green: "bg-[#E7F5EC] text-[#1E7A3F]",
  red: "bg-[#FBEAEA] text-[#B3261E]",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-xs",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
