import * as React from "react";
import { Badge } from "./ui/Badge";
import { Card, CardHeader, CardBody } from "./ui/Card";

const methodTone: Record<string, "green" | "indigo" | "amber" | "red"> = {
  GET: "indigo",
  POST: "green",
  PATCH: "amber",
  DELETE: "red",
};

export function EndpointCard({
  method,
  path,
  headers,
  children,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  headers?: Array<{ name: string; value: string; required?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center gap-3">
        <Badge tone={methodTone[method]}>{method}</Badge>
        <code className="font-mono text-sm text-ink">{path}</code>
      </CardHeader>
      <CardBody className="space-y-6">
        {headers && headers.length > 0 && (
          <div>
            <h3 className="mb-2 font-display text-sm font-medium text-ink">Headers</h3>
            <ul className="space-y-1.5">
              {headers.map((h) => (
                <li key={h.name} className="flex flex-wrap items-baseline gap-2 font-mono text-[13px]">
                  <span className="text-ink">{h.name}</span>
                  <span className="text-muted">{h.value}</span>
                  {h.required && <Badge tone="amber">required</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {children}
      </CardBody>
    </Card>
  );
}
