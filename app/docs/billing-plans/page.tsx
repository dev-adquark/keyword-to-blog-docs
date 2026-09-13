import type { Metadata } from "next";
import { DocsPageShell } from "@/components/DocsPageShell";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";
import { JsonBlock } from "@/components/JsonBlock";
import { Badge } from "@/components/ui/Badge";
import { PLANS } from "@/lib/plans";
import { errorQuotaExceededExample } from "@/lib/examples/usage-and-errors";

export const metadata: Metadata = {
  title: "Billing & plans",
  description: "Plan tiers, throughput, quotas, and team seats.",
  openGraph: {
    title: "Billing & plans — Keyword-to-Blog API",
    description: "Plan tiers, throughput, quotas, and team seats.",
    type: "article",
    url: "/docs/billing-plans",
  },
};

export default function BillingPlansPage() {
  return (
    <DocsPageShell>
      <div className="max-w-prose">
        <p className="font-mono text-xs text-indigo">Reference</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-ink">Billing & plans</h1>
        <p className="mt-3 font-body text-[15px] leading-relaxed text-muted">
          Every plan meters usage in words per month, with a per-request cap and a requests-per-minute
          throughput limit. These numbers are the single source of truth used everywhere else in
          these docs.
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.id} className="rounded-lg border border-line bg-white p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-[16px] font-medium text-ink">{plan.name}</h3>
                {plan.priorityProcessing && <Badge tone="amber">priority</Badge>}
              </div>
              <p className="mt-2 font-display text-2xl font-medium text-ink">
                ${plan.priceMonthlyUsd}
                <span className="font-body text-sm font-normal text-muted">/mo</span>
              </p>
              <ul className="mt-4 space-y-1.5 font-mono text-[12px] text-muted">
                <li>{plan.requestsPerMinute} req/min</li>
                <li>{plan.maxWordsPerRequest.toLocaleString()} words/request cap</li>
                <li>{plan.monthlyWords.toLocaleString()} words/mo</li>
                <li>{plan.teamSeats} team seat{plan.teamSeats > 1 ? "s" : ""}</li>
              </ul>
            </div>
          ))}
        </div>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Rate limits & quotas</h2>
        <Table>
          <Thead>
            <Tr>
              <Th>Plan</Th>
              <Th>Requests/min</Th>
              <Th>Max words/request</Th>
              <Th>Monthly word cap</Th>
              <Th>Priority processing</Th>
            </Tr>
          </Thead>
          <tbody>
            {PLANS.map((plan) => (
              <Tr key={plan.id}>
                <Td className="font-medium">{plan.name}</Td>
                <Td className="font-mono">{plan.requestsPerMinute}</Td>
                <Td className="font-mono">{plan.maxWordsPerRequest.toLocaleString()}</Td>
                <Td className="font-mono">{plan.monthlyWords.toLocaleString()}</Td>
                <Td>{plan.priorityProcessing ? "Yes" : "No"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>

        <h2 className="mt-10 font-display text-xl font-medium text-ink">Quota exceeded response</h2>
        <p className="mt-3 font-body text-[15px] text-muted">
          Once <code className="font-mono">consumed.words</code> reaches{" "}
          <code className="font-mono">limits.monthlyWords</code>, further generation requests return:
        </p>
        <div className="mt-3">
          <JsonBlock data={errorQuotaExceededExample} filename="429/402 depending on plan config" />
        </div>
      </div>
    </DocsPageShell>
  );
}
