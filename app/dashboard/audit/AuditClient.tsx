"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";

interface AuditEvent {
  id: string;
  eventType: string;
  actorEmail: string | null;
  targetUserEmail: string | null;
  targetApiKeyPrefix: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

const EVENT_TONE: Record<string, "green" | "red" | "amber" | "neutral"> = {
  login_success: "green",
  login_failed: "red",
  user_status_changed: "amber",
  api_key_revoked: "amber",
};

function describe(e: AuditEvent): string {
  switch (e.eventType) {
    case "login_success":
      return `${e.targetUserEmail ?? e.metadata?.email ?? "unknown"} logged in`;
    case "login_failed":
      return `Failed login attempt for ${e.targetUserEmail ?? e.metadata?.email ?? "unknown"}`;
    case "user_status_changed":
      return `${e.actorEmail ?? "An owner"} set ${e.targetUserEmail ?? "a user"}'s status to ${e.metadata?.status ?? "?"}`;
    case "api_key_revoked":
      return `${e.actorEmail ?? "An owner"} revoked key ${e.targetApiKeyPrefix ?? ""}…`;
    default:
      return e.eventType;
  }
}

export function AuditClient() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetch("/api/dashboard/audit")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => {
        setEvents(json.events);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">Audit log</h1>
        <p className="text-[14px] text-muted">Real account-security events — logins, status changes, key revocations.</p>
      </div>

      {state === "loading" && <p className="text-sm text-muted">Loading…</p>}
      {state === "error" && (
        <Alert tone="danger" title="Couldn't load the audit log">
          Please refresh the page.
        </Alert>
      )}
      {state === "ready" && events && (
        <Card>
          <CardHeader>
            <span className="font-body text-sm font-medium text-ink">Recent events</span>
          </CardHeader>
          <CardBody>
            {events.length === 0 ? (
              <p className="text-sm text-muted">No audit events yet.</p>
            ) : (
              <Table>
                <Thead>
                  <Tr>
                    <Th>Time</Th>
                    <Th>Event</Th>
                    <Th>IP</Th>
                  </Tr>
                </Thead>
                <tbody>
                  {events.map((e) => (
                    <Tr key={e.id}>
                      <Td>{new Date(e.createdAt).toLocaleString()}</Td>
                      <Td>
                        <div className="flex items-center gap-2">
                          <Badge tone={EVENT_TONE[e.eventType] ?? "neutral"}>{e.eventType}</Badge>
                          <span>{describe(e)}</span>
                        </div>
                      </Td>
                      <Td>{e.ip ?? "—"}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
