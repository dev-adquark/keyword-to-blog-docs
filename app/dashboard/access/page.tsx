"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { PLANS } from "@/lib/plans";

export default function AccessPage() {
  const [requestedPlan, setRequestedPlan] = useState<"growth" | "scale">("growth");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/access-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ requestedPlan, reason }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.message || "Couldn't submit your request.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Plan &amp; access</h1>
        <p className="text-[14px] text-muted">
          Automated billing isn&apos;t connected yet, so upgrades go through a short review
          instead of instant checkout.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <Card key={plan.id}>
            <CardBody>
              <p className="font-display text-lg text-ink">{plan.name}</p>
              <p className="text-[13px] text-muted">
                {plan.priceMonthlyUsd === 0 ? "Free" : `$${plan.priceMonthlyUsd}/mo`}
              </p>
              <ul className="mt-2 list-disc pl-4 text-[13px] text-muted">
                <li>{plan.requestsPerDay} requests/day</li>
                <li>{plan.requestsPerMinute} requests/minute</li>
                <li>{plan.maxWordsPerRequest.toLocaleString()} words/request</li>
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Request increased access</span>
        </CardHeader>
        <CardBody>
          {submitted ? (
            <Alert tone="info" title="Request submitted">
              We&apos;ve recorded your request. You&apos;ll be moved to the new plan once it&apos;s
              reviewed.
            </Alert>
          ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
              {error && (
                <Alert tone="danger" title="Couldn't submit request">
                  {error}
                </Alert>
              )}
              <label className="flex flex-col gap-1.5 text-sm text-ink">
                Plan
                <select
                  value={requestedPlan}
                  onChange={(e) => setRequestedPlan(e.target.value as "growth" | "scale")}
                  className="h-10 w-48 rounded-md border border-line px-3 text-[14px] outline-none focus:border-indigo"
                >
                  <option value="growth">Growth</option>
                  <option value="scale">Scale</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm text-ink">
                Reason (optional)
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="rounded-md border border-line px-3 py-2 text-[14px] outline-none focus:border-indigo"
                />
              </label>
              <Button type="submit" disabled={submitting} className="self-start">
                {submitting ? "Submitting…" : "Request increased access"}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
