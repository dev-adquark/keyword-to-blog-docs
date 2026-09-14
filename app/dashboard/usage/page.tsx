"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

interface Overview {
  plan: { id: string; name: string };
  requestsToday: number;
  daily: { limit: number; remaining: number };
}

export default function UsagePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/dashboard/overview")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => {
        setData(json);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Usage</h1>
        <p className="text-[14px] text-muted">
          This reflects the same counters enforced by the API — nothing here is hard-coded.
        </p>
      </div>

      {state === "loading" && <p className="text-sm text-muted">Loading usage…</p>}
      {state === "error" && (
        <Alert tone="danger" title="Couldn't load usage">
          Please refresh the page.
        </Alert>
      )}
      {state === "ready" && data && (
        <Card>
          <CardHeader>
            <span className="font-body text-sm font-medium text-ink">Today ({data.plan.name} plan)</span>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            <p className="text-[14px] text-ink">
              {data.daily.limit - data.daily.remaining} / {data.daily.limit} requests used
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface">
              <div
                className="h-full bg-indigo"
                style={{
                  width: `${Math.min(
                    100,
                    ((data.daily.limit - data.daily.remaining) / Math.max(1, data.daily.limit)) *
                      100
                  )}%`,
                }}
              />
            </div>
            <p className="text-[13px] text-muted">Resets daily at 00:00 UTC.</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
