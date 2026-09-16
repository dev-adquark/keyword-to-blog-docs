"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";

interface MemberData {
  profile: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    createdAt: string;
    lastLoginAt: string | null;
  };
  apiKeys: Array<{
    id: string;
    name: string;
    prefix: string;
    environment: string;
    status: string;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
  activeKeyCount: number;
  revokedKeyCount: number;
  usage: {
    requestsToday: number;
    wordsToday: number;
    postsToday: number;
    requestsThisMonth: number;
    wordsThisMonth: number;
    postsThisMonth: number;
  };
  jobs: { queued: number; processing: number; succeeded: number; failed: number };
}

export function MemberClient({ userId }: { userId: string }) {
  const [data, setData] = useState<MemberData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  function reload() {
    setState("loading");
    fetch(`/api/dashboard/team/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => {
        setData(json);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(() => {
    // State already starts as "loading" — avoid a redundant synchronous
    // setState("loading") inside the effect, which react-hooks flags.
    fetch(`/api/dashboard/team/${userId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => {
        setData(json);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [userId]);

  async function onToggleStatus() {
    if (!data) return;
    const nextStatus = data.profile.status === "active" ? "disabled" : "active";
    setTogglingStatus(true);
    setStatusError(null);
    try {
      const res = await fetch(`/api/dashboard/team/${userId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setStatusError(body?.message || "Couldn't update status.");
        return;
      }
      reload();
    } catch {
      setStatusError("Network error. Please try again.");
    } finally {
      setTogglingStatus(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Loading member…</p>;
  if (state === "error" || !data) {
    return (
      <Alert tone="danger" title="Couldn't load this team member">
        Please refresh the page.
      </Alert>
    );
  }

  const { profile } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/dashboard/team" className="text-sm text-indigo hover:underline">
          ← Team
        </Link>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">{profile.name}</h1>
        <p className="text-[14px] text-muted">{profile.email}</p>
      </div>

      {statusError && (
        <Alert tone="danger" title="Couldn't update status">
          {statusError}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Profile</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted">Role</p>
              <p className="text-ink">{profile.role}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Status</p>
              <Badge tone={profile.status === "active" ? "green" : "red"}>{profile.status}</Badge>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Created</p>
              <p className="text-ink">{new Date(profile.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Last login</p>
              <p className="text-ink">
                {profile.lastLoginAt ? new Date(profile.lastLoginAt).toLocaleString() : "Never"}
              </p>
            </div>
          </div>
          <div>
            <Button
              size="sm"
              variant="secondary"
              disabled={togglingStatus}
              onClick={onToggleStatus}
            >
              {togglingStatus
                ? "Updating…"
                : profile.status === "active"
                  ? "Disable account"
                  : "Enable account"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Requests today</p>
            <p className="mt-1 font-display text-xl text-ink">{data.usage.requestsToday}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Requests this month</p>
            <p className="mt-1 font-display text-xl text-ink">{data.usage.requestsThisMonth}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Words this month</p>
            <p className="mt-1 font-display text-xl text-ink">{data.usage.wordsThisMonth}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">
            API keys ({data.activeKeyCount} active, {data.revokedKeyCount} revoked)
          </span>
        </CardHeader>
        <CardBody>
          {data.apiKeys.length === 0 ? (
            <p className="text-sm text-muted">No API keys yet.</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Name</Th>
                  <Th>Key</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                  <Th>Last used</Th>
                  <Th> </Th>
                </Tr>
              </Thead>
              <tbody>
                {data.apiKeys.map((k) => (
                  <Tr key={k.id}>
                    <Td>{k.name}</Td>
                    <Td>
                      <code className="font-mono text-[13px] text-muted">{k.prefix}…</code>
                    </Td>
                    <Td>
                      <Badge tone={k.status === "active" ? "green" : "red"}>{k.status}</Badge>
                    </Td>
                    <Td>{new Date(k.createdAt).toLocaleDateString()}</Td>
                    <Td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleString() : "Never"}</Td>
                    <Td>
                      <Link href={`/dashboard/team/keys/${k.id}`} className="text-indigo hover:underline">
                        Details
                      </Link>
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
