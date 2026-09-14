"use client";

import { useEffect, useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Table, Thead, Tr, Th, Td } from "@/components/ui/Table";

interface ApiKeyRow {
  id: string;
  prefix: string;
  name: string;
  environment: string;
  status: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  function load() {
    setState("loading");
    fetch("/api/dashboard/api-keys")
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((json) => {
        setKeys(json.keys);
        setState("ready");
      })
      .catch(() => setState("error"));
  }

  useEffect(load, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/dashboard/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, environment }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreateError(data.message || "Couldn't create the key.");
        return;
      }
      setNewRawKey(data.key.rawKey);
      setName("");
      load();
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: string) {
    setRevokingId(id);
    setRevokeError(null);
    try {
      const res = await fetch(`/api/dashboard/api-keys/${id}/revoke`, { method: "POST" });
      if (res.ok) {
        load();
      } else {
        setRevokeError("Couldn't revoke the key. Please try again.");
      }
    } catch {
      setRevokeError("Network error. Please try again.");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyKey() {
    if (!newRawKey) return;
    try {
      await navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail (permissions, insecure context) — the key stays selectable either way.
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-medium text-ink">API keys</h1>
        <p className="text-[14px] text-muted">
          Keep your API key secret. It will only be shown once, right after creation.
        </p>
      </div>

      {revokeError && (
        <Alert tone="danger" title="Revoke failed">
          {revokeError}
        </Alert>
      )}

      {newRawKey && (
        <Card className="border-indigo-soft">
          <CardHeader>
            <span className="font-body text-sm font-medium text-ink">Your new API key</span>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <Alert tone="warning" title="This will only be shown once">
              Copy it now and store it somewhere safe. If you lose it, revoke the key and create
              a new one.
            </Alert>
            <code className="break-all rounded-md bg-surface px-3 py-2 font-mono text-[13px] text-ink">
              {newRawKey}
            </code>
            <div className="flex items-center gap-3">
              <Button size="sm" onClick={copyKey}>
                {copied ? "Copied!" : "Copy API key"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNewRawKey(null)}>
                Done
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Create API key</span>
        </CardHeader>
        <CardBody>
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production"
                className="h-10 w-56 rounded-md border border-line px-3 text-[14px] outline-none focus:border-indigo"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Environment
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "live" | "test")}
                className="h-10 rounded-md border border-line px-3 text-[14px] outline-none focus:border-indigo"
              >
                <option value="live">Live</option>
                <option value="test">Test</option>
              </select>
            </label>
            <Button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create API key"}
            </Button>
          </form>
          {createError && (
            <p className="mt-2 text-[13px] text-[#B3261E]">{createError}</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Your keys</span>
        </CardHeader>
        <CardBody>
          {state === "loading" && <p className="text-sm text-muted">Loading…</p>}
          {state === "error" && (
            <Alert tone="danger" title="Couldn't load your API keys">
              Please refresh the page.
            </Alert>
          )}
          {state === "ready" && keys && keys.length === 0 && (
            <p className="text-sm text-muted">No API keys yet. Create one above.</p>
          )}
          {state === "ready" && keys && keys.length > 0 && (
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
                {keys.map((k) => (
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
                      {k.status === "active" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={revokingId === k.id}
                          onClick={() => onRevoke(k.id)}
                        >
                          {revokingId === k.id ? "Revoking…" : "Revoke"}
                        </Button>
                      )}
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
