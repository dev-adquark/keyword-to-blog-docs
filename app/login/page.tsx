"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    setUnverifiedEmail(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("error");
        if (data?.code === "EMAIL_NOT_VERIFIED") {
          setUnverifiedEmail(data.email || email);
          setError(data.message || "Your email is not verified.");
        } else {
          setError(data?.message || "Invalid email or password.");
        }
        return;
      }
      router.push(searchParams.get("next") || "/dashboard");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  async function onSendVerification() {
    if (!unverifiedEmail) return;
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: unverifiedEmail }),
      });
    } finally {
      setResendState("sent");
      router.push(`/verify-email?email=${encodeURIComponent(unverifiedEmail)}`);
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-6 font-display text-2xl font-medium text-ink">Log in</h1>
      {searchParams.get("verified") === "1" && (
        <div className="mb-4">
          <Alert tone="info" title="Email verified">
            Your email is verified. Please log in below.
          </Alert>
        </div>
      )}
      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Welcome back</span>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger" title="Couldn't log you in">
                <div className="flex flex-col gap-2">
                  <span>{error}</span>
                  {unverifiedEmail && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={onSendVerification}
                      disabled={resendState === "sending"}
                    >
                      {resendState === "sending" ? "Sending…" : "Send verification code"}
                    </Button>
                  )}
                </div>
              </Alert>
            )}
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Email
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 rounded-md border border-line px-3 text-[15px] outline-none focus:border-indigo"
                autoComplete="email"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              <span className="flex items-center justify-between">
                Password
                <Link href="/forgot-password" className="text-xs font-normal text-indigo hover:underline">
                  Forgot password?
                </Link>
              </span>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-md border border-line px-3 text-[15px] outline-none focus:border-indigo"
                autoComplete="current-password"
              />
            </label>
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Logging in…" : "Log in"}
            </Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="text-indigo hover:underline">
          Sign up
        </Link>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
