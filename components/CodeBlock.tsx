"use client";

import * as React from "react";

export function CodeBlock({
  code,
  language,
  filename,
}: {
  code: string;
  language?: string;
  filename?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard unavailable — fail silently, button just won't confirm
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-ink">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <span className="font-mono text-xs text-white/50">{filename ?? language ?? "shell"}</span>
        <button
          onClick={handleCopy}
          className="font-mono text-xs text-white/60 hover:text-white transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed">
        <code className="font-mono text-[#E4E2F5]">{code}</code>
      </pre>
    </div>
  );
}
