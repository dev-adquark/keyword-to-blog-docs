"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { OtpInput } from "@/components/OtpInput";

const RESEND_COOLDOWN_SECONDS = 60;
const RESET_TOKEN_STORAGE_KEY = "ktb_reset_token";
type Step = "email" | "otp";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  async function onSubmitEmail(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      // Always proceed to the OTP step — the API response never reveals
      // whether an account exists for this email.
      setStep("otp");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  async function onResend() {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_SECONDS);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
  }

  async function onVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-reset-otp", {
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
      sessionStorage.setItem(RESET_TOKEN_STORAGE_KEY, data.resetToken);
      router.push("/reset-password");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="mb-1 font-display text-2xl font-medium text-ink">Forgot password?</h1>
      <p className="mb-6 text-[14px] text-muted">
        {step === "email"
          ? "Enter your account email and we'll send you a verification code."
          : "Enter the 6-digit code we sent you."}
      </p>
      <Card>
        <CardHeader>
          <span className="font-body text-sm font-medium text-ink">Reset your password</span>
        </CardHeader>
        <CardBody>
          {error && (
            <div className="mb-4">
              <Alert tone="danger" title="Something went wrong">
                {error}
              </Alert>
            </div>
          )}

          {step === "email" && (
            <form onSubmit={onSubmitEmail} className="flex flex-col gap-4">
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
              <Button type="submit" disabled={status === "loading"}>
                {status === "loading" ? "Sending…" : "Send verification code"}
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={onVerifyOtp} className="flex flex-col gap-4">
              <OtpInput value={otp} onChange={setOtp} disabled={status === "loading"} />
              <Button type="submit" disabled={status === "loading" || otp.length !== 6}>
                {status === "loading" ? "Verifying…" : "Verify code"}
              </Button>
              <div className="text-center text-sm">
                {cooldown > 0 ? (
                  <span className="text-muted">Resend available in {cooldown}s</span>
                ) : (
                  <button type="button" onClick={onResend} className="text-indigo hover:underline">
                    Resend code
                  </button>
                )}
              </div>
            </form>
          )}
        </CardBody>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/login" className="text-indigo hover:underline">
          Back to login
        </Link>
      </p>
    </main>
  );
}
