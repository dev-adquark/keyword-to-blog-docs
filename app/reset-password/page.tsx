"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const RESET_TOKEN_STORAGE_KEY = "ktb_reset_token";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // sessionStorage doesn't exist during SSR, so this can only be read on
    // the client after mount — reading it eagerly in a lazy useState
    // initializer would mismatch the server-rendered markup instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setResetToken(sessionStorage.getItem(RESET_TOKEN_STORAGE_KEY));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resetToken, newPassword, confirmPassword }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("error");
        setError(data?.message || "Couldn't reset your password.");
        return;
      }
      sessionStorage.removeItem(RESET_TOKEN_STORAGE_KEY);
      setStatus("done");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  if (status === "done") {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <h1 className="mb-6 font-display text-2xl font-medium text-ink">Password reset successful</h1>
        <Card>
          <CardBody className="flex flex-col gap-4">
            <Alert tone="info" title="Success">
              Your password has been changed. Please log in with your new password.
            </Alert>
            <Button onClick={() => router.push("/login")}>Go to login</Button>
          </CardBody>
        </Card>
      </main>
    );
  }

  if (resetToken === null) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Alert tone="danger" title="Nothing to reset">
          Please start the password reset process again.
        </Alert>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/forgot-password" className="text-indigo hover:underline">
            Forgot password
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-1 font-display text-2xl font-medium text-ink">Set a new password</h1>
      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">New password</span>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger" title="Couldn't reset your password">
                {error}
              </Alert>
            )}
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              New password
              <input
                required
                type="password"
                minLength={10}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11 rounded-md border border-line px-3 text-[15px] outline-none focus:border-indigo"
                autoComplete="new-password"
              />
              <span className="text-xs text-muted">At least 10 characters.</span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Confirm new password
              <input
                required
                type="password"
                minLength={10}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11 rounded-md border border-line px-3 text-[15px] outline-none focus:border-indigo"
                autoComplete="new-password"
              />
            </label>
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Saving…" : "Set new password"}
            </Button>
          </form>
        </CardBody>
      </Card>
    </main>
  );
}
