"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

interface Overview {
  name: string;
  email: string;
  plan: { id: string; name: string; priceMonthlyUsd: number };
  apiKeyCount: number;
  requestsToday: number;
  daily: { limit: number; remaining: number };
  lastApiRequestAt: string | null;
}

export default function DashboardOverviewPage() {
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

  if (state === "loading") {
    return <p className="text-sm text-muted">Loading your account…</p>;
  }
  if (state === "error" || !data) {
    return (
      <Alert tone="danger" title="Couldn't load your dashboard">
        Please refresh the page. If this keeps happening, contact support.
      </Alert>
    );
  }

  const usedToday = data.daily.limit - data.daily.remaining;
  const atLimit = data.daily.remaining <= 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">
          Welcome back, {data.name}
        </h1>
        <p className="text-[14px] text-muted">{data.email}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Current plan</p>
            <p className="mt-1 font-display text-xl text-ink">{data.plan.name}</p>
            <p className="text-[13px] text-muted">
              {data.plan.priceMonthlyUsd === 0 ? "Free" : `$${data.plan.priceMonthlyUsd}/mo`}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Active API keys</p>
            <p className="mt-1 font-display text-xl text-ink">{data.apiKeyCount}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Requests today</p>
            <p className="mt-1 font-display text-xl text-ink">{data.requestsToday}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Daily quota</span>
        </CardHeader>
        <CardBody>
          <p className="text-[14px] text-ink">
            {usedToday} / {data.daily.limit} daily requests used
          </p>
          {atLimit ? (
            <div className="mt-3 flex flex-col gap-3">
              <Alert tone="warning" title="Limit reached">
                You&apos;ve used all of today&apos;s requests on your busiest key. It resets at
                midnight UTC.
              </Alert>
              <div className="flex gap-3">
                <Button href="/dashboard/access" size="sm">
                  Request higher access
                </Button>
                <Button href="/dashboard/usage" variant="secondary" size="sm">
                  View usage
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-1 text-[13px] text-muted">
              Resets daily at 00:00 UTC. Need more?{" "}
              <Link href="/dashboard/access" className="text-indigo hover:underline">
                Request an upgrade
              </Link>
              .
            </p>
          )}
        </CardBody>
      </Card>

      {data.apiKeyCount === 0 && (
        <Alert tone="info" title="Create your first API key">
          You don&apos;t have any API keys yet.{" "}
          <Link href="/dashboard/api-keys" className="underline">
            Create one
          </Link>{" "}
          to start calling the API.
        </Alert>
      )}
    </div>
  );
}
