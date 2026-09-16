"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";

interface KeyData {
  key: {
    id: string;
    name: string;
    prefix: string;
    environment: string;
    status: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
    owner: { id: string; email: string; name: string };
  };
  usage: {
    requestsToday: number;
    wordsToday: number;
    postsToday: number;
    requestsThisMonth: number;
    wordsThisMonth: number;
    postsThisMonth: number;
    failedThisMonth: number;
    rateLimitedThisMonth: number;
  };
  recentRequests: Array<{
    id: string;
    createdAt: string;
    endpoint: string;
    statusCode: number;
    success: boolean;
    words: number;
    posts: number;
    durationMs: number;
  }>;
}

export function KeyClient({ keyId }: { keyId: string }) {
  const [data, setData] = useState<KeyData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  function reload() {
    setState("loading");
    fetch(`/api/dashboard/team/keys/${keyId}`)
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
    fetch(`/api/dashboard/team/keys/${keyId}`)
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => {
        setData(json);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [keyId]);

  async function onRevoke() {
    setRevoking(true);
    setRevokeError(null);
    try {
      const res = await fetch(`/api/dashboard/team/keys/${keyId}/revoke`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setRevokeError(body?.message || "Couldn't revoke the key.");
        return;
      }
      reload();
    } catch {
      setRevokeError("Network error. Please try again.");
    } finally {
      setRevoking(false);
    }
  }

  if (state === "loading") return <p className="text-sm text-muted">Loading key…</p>;
  if (state === "error" || !data) {
    return (
      <Alert tone="danger" title="Couldn't load this API key">
        Please refresh the page.
      </Alert>
    );
  }

  const { key, usage } = data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/dashboard/team/${key.owner.id}`} className="text-sm text-indigo hover:underline">
          ← {key.owner.name}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-medium text-ink">{key.name}</h1>
        <p className="text-[14px] text-muted">
          <code className="font-mono text-[13px]">{key.prefix}…</code> · owned by {key.owner.email}
        </p>
      </div>

      {revokeError && (
        <Alert tone="danger" title="Couldn't revoke key">
          {revokeError}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Key details</span>
        </CardHeader>
        <CardBody className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-4">
            <div>
              <p className="text-xs uppercase text-muted">Status</p>
              <Badge tone={key.status === "active" ? "green" : "red"}>{key.status}</Badge>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Environment</p>
              <p className="text-ink">{key.environment}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Created</p>
              <p className="text-ink">{new Date(key.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <p className="text-xs uppercase text-muted">Last used</p>
              <p className="text-ink">{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</p>
            </div>
          </div>
          {key.status === "active" && (
            <div>
              <Button size="sm" variant="secondary" disabled={revoking} onClick={onRevoke}>
                {revoking ? "Revoking…" : "Revoke key"}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Requests today</p>
            <p className="mt-1 font-display text-xl text-ink">{usage.requestsToday}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Requests this month</p>
            <p className="mt-1 font-display text-xl text-ink">{usage.requestsThisMonth}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Failed (mo)</p>
            <p className="mt-1 font-display text-xl text-ink">{usage.failedThisMonth}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs uppercase text-muted">Rate-limited (mo)</p>
            <p className="mt-1 font-display text-xl text-ink">{usage.rateLimitedThisMonth}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Recent requests</span>
        </CardHeader>
        <CardBody>
          {data.recentRequests.length === 0 ? (
            <p className="text-sm text-muted">No requests yet on this key.</p>
          ) : (
            <Table>
              <Thead>
                <Tr>
                  <Th>Time</Th>
                  <Th>Endpoint</Th>
                  <Th>Result</Th>
                  <Th>Words</Th>
                  <Th>Duration</Th>
                </Tr>
              </Thead>
              <tbody>
                {data.recentRequests.map((r) => (
                  <Tr key={r.id}>
                    <Td>{new Date(r.createdAt).toLocaleString()}</Td>
                    <Td>{r.endpoint}</Td>
                    <Td>
                      <Badge tone={r.success ? "green" : r.statusCode === 429 ? "amber" : "red"}>
                        {r.statusCode}
                      </Badge>
                    </Td>
                    <Td>{r.words}</Td>
                    <Td>{r.durationMs}ms</Td>
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
