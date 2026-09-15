"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { OtpInput } from "@/components/OtpInput";

const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!user || !domain) return email;
  const visible = user.slice(0, 1);
  return `${visible}${"*".repeat(Math.max(user.length - 1, 3))}@${domain}`;
}

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";

  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle");

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus("error");
        setError(data?.message || "Invalid or expired code.");
        return;
      }
      router.push("/login?verified=1");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  async function onResend() {
    if (resendCooldown > 0 || !email) return;
    setResendState("sending");
    try {
      await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setResendState("sent");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    }
  }

  if (!email) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <Alert tone="danger" title="Missing email">
          Please sign up again to receive a verification code.
        </Alert>
        <p className="mt-4 text-center text-sm text-muted">
          <Link href="/signup" className="text-indigo hover:underline">
            Back to sign up
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-1 font-display text-2xl font-medium text-ink">Verify your email</h1>
      <p className="mb-6 text-[14px] text-muted">
        We sent a 6-digit verification code to <span className="font-medium text-ink">{maskEmail(email)}</span>.
      </p>
      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Enter verification code</span>
        </CardHeader>
        <CardBody>
          <form onSubmit={onVerify} className="flex flex-col gap-4">
            {error && (
              <Alert tone="danger" title="Couldn't verify your email">
                {error}
              </Alert>
            )}
            <OtpInput value={otp} onChange={setOtp} disabled={status === "loading"} />
            <Button type="submit" disabled={status === "loading" || otp.length !== 6}>
              {status === "loading" ? "Verifying…" : "Verify email"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            {resendCooldown > 0 ? (
              <span className="text-muted">Resend available in {resendCooldown}s</span>
            ) : (
              <button
                type="button"
                onClick={onResend}
                disabled={resendState === "sending"}
                className="text-indigo hover:underline disabled:opacity-50"
              >
                {resendState === "sending" ? "Sending…" : "Resend code"}
              </button>
            )}
            {resendState === "sent" && resendCooldown === RESEND_COOLDOWN_SECONDS && (
              <p className="mt-1 text-xs text-muted">A new code has been sent, if applicable.</p>
            )}
          </div>
        </CardBody>
      </Card>
    </main>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
