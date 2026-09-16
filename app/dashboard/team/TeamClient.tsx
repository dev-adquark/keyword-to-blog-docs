"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";

interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
  apiKeyCount: number;
  activeApiKeyCount: number;
  requestsToday: number;
  requestsThisMonth: number;
  postsGenerated: number;
  wordsGenerated: number;
  lastActivityAt: string | null;
}

interface RecentActivity {
  id: string;
  createdAt: string;
  userEmail: string;
  keyPrefix: string;
  endpoint: string;
  statusCode: number;
  success: boolean;
  words: number;
  posts: number;
}

interface TeamData {
  members: Member[];
  summary: {
    requestsToday: number;
    postsToday: number;
    wordsToday: number;
    rateLimitedToday: number;
    activeMembers: number;
    activeApiKeys: number;
  };
  recentActivity: RecentActivity[];
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase text-muted">{label}</p>
        <p className="mt-1 font-display text-xl text-ink">{value}</p>
      </CardBody>
    </Card>
  );
}

export function TeamClient() {
  const [data, setData] = useState<TeamData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/dashboard/team")
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

  if (state === "loading") return <p className="text-sm text-muted">Loading team…</p>;
  if (state === "error" || !data) {
    return (
      <Alert tone="danger" title="Couldn't load the team dashboard">
        Please refresh the page.
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Team</h1>
        <p className="text-[14px] text-muted">Real usage across every internal account — nothing here is mocked.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
        <SummaryCard label="Requests today" value={data.summary.requestsToday} />
        <SummaryCard label="Posts today" value={data.summary.postsToday} />
        <SummaryCard label="Words today" value={data.summary.wordsToday} />
        <SummaryCard label="Rate-limited" value={data.summary.rateLimitedToday} />
        <SummaryCard label="Active members" value={data.summary.activeMembers} />
        <SummaryCard label="Active API keys" value={data.summary.activeApiKeys} />
      </div>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Members</span>
        </CardHeader>
        <CardBody>
          <Table>
            <Thead>
              <Tr>
                <Th>Member</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>API keys</Th>
                <Th>Req. today</Th>
                <Th>Req. this month</Th>
                <Th>Posts (mo)</Th>
                <Th>Words (mo)</Th>
                <Th>Last login</Th>
              </Tr>
            </Thead>
            <tbody>
              {data.members.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <Link href={`/dashboard/team/${m.id}`} className="text-indigo hover:underline">
                      {m.name}
                    </Link>
                    <div className="text-xs text-muted">{m.email}</div>
                  </Td>
                  <Td>{m.role}</Td>
                  <Td>
                    <Badge tone={m.status === "active" ? "green" : "red"}>{m.status}</Badge>
                  </Td>
                  <Td>{m.activeApiKeyCount}</Td>
                  <Td>{m.requestsToday}</Td>
                  <Td>{m.requestsThisMonth}</Td>
                  <Td>{m.postsGenerated}</Td>
                  <Td>{m.wordsGenerated}</Td>
                  <Td>{m.lastLoginAt ? new Date(m.lastLoginAt).toLocaleString() : "Never"}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Recent activity</span>
        </CardHeader>
        <CardBody>
          {data.recentActivity.length === 0 ? (
            <p className="text-sm text-muted">No API requests yet.</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Time</Th>
                  <Th>Member</Th>
                  <Th>API key</Th>
                  <Th>Endpoint</Th>
                  <Th>Result</Th>
                </Tr>
              </Thead>
              <tbody>
                {data.recentActivity.map((e) => (
                  <Tr key={e.id}>
                    <Td>{new Date(e.createdAt).toLocaleString()}</Td>
                    <Td>{e.userEmail}</Td>
                    <Td>
                      <code className="font-mono text-[13px] text-muted">{e.keyPrefix}…</code>
                    </Td>
                    <Td>{e.endpoint}</Td>
                    <Td>
                      <Badge tone={e.success ? "green" : e.statusCode === 429 ? "amber" : "red"}>
                        {e.statusCode}
                      </Badge>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
