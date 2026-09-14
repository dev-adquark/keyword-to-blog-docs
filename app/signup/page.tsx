"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      let data: { message?: string } | null = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        setStatus("error");
        setError(data?.message || "Something went wrong. Please try again.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-1 font-display text-2xl font-medium text-ink">Create your account</h1>
      <p className="mb-6 text-[14px] text-muted">
        Create your account, generate your API key, and start using the Keyword-to-Blog API.
      </p>
      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Sign up</span>
        </CardHeader>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger" title="Couldn't create your account">
                {error}
              </Alert>
            )}
            <label className="flex flex-col gap-1.5 text-sm text-ink">
              Name
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-11 rounded-md border border-line px-3 text-[15px] outline-none focus:border-indigo"
                autoComplete="name"
              />
            </label>
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
              Password
              <input
                required
                type="password"
                minLength={10}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 rounded-md border border-line px-3 text-[15px] outline-none focus:border-indigo"
                autoComplete="new-password"
              />
              <span className="text-xs text-muted">At least 10 characters.</span>
            </label>
            <Button type="submit" disabled={status === "loading"}>
              {status === "loading" ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="text-indigo hover:underline">
          Log in
        </Link>
      </p>
    </main>
  );
}
