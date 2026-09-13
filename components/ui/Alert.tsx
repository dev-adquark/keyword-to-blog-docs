import * as React from "react";
import clsx from "clsx";

type Tone = "info" | "warning" | "danger";

const tones: Record<Tone, string> = {
  info: "border-indigo-soft bg-indigo-soft/60 text-ink",
  warning: "border-amber-soft bg-amber-soft text-ink",
  danger: "border-[#F5D0D0] bg-[#FBEAEA] text-ink",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={clsx("rounded-md border px-4 py-3 text-sm leading-relaxed", tones[tone])}>
      {title && <p className="mb-1 font-body font-semibold">{title}</p>}
      <div className="font-body text-[14px]">{children}</div>
    </div>
  );
}
