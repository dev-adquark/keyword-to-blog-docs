import { CodeBlock } from "./CodeBlock";

export function JsonBlock({ data, filename }: { data: unknown; filename?: string }) {
  return <CodeBlock code={JSON.stringify(data, null, 2)} language="json" filename={filename ?? "json"} />;
}
