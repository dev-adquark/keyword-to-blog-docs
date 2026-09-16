import "server-only";
import { env } from "./env";

/**
 * Transactional auth email (password-reset OTP delivery) via Resend —
 * distinct from lib/server/notifications.ts, which is owner-only alerting.
 * This is user-facing and functionally required (the OTP has no other
 * delivery channel), so a failure here is logged loudly, but the calling
 * route still decides whether to fail the request; this module never
 * fabricates success. There is no sign-up/email-verification flow — this app
 * is internal-team-only and admin-provisioned.
 */

async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean }> {
  if (!env.RESEND_API_KEY) {
    console.error(
      JSON.stringify({ level: "error", message: "auth_email_not_configured", to_domain: params.to.split("@")[1] })
    );
    return { ok: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [params.to],
        subject: params.subject,
        text: params.text,
      }),
    });

    if (!res.ok) {
      console.error(
        JSON.stringify({ level: "error", message: "auth_email_send_failed", status: res.status })
      );
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        message: "auth_email_send_error",
        error: err instanceof Error ? err.message : String(err),
      })
    );
    return { ok: false };
  }
}

export async function sendPasswordResetEmail(params: {
  to: string;
  otp: string;
}): Promise<{ ok: boolean }> {
  return sendEmail({
    to: params.to,
    subject: "Your password reset code — Keyword-to-Blog API",
    text: [
      "Someone requested a password reset for your Keyword-to-Blog API account.",
      "",
      `Your password reset code is: ${params.otp}`,
      "",
      "This code expires in 10 minutes and can only be used once.",
      "",
      "If you didn't request this, you can safely ignore this email — your password will not be changed.",
    ].join("\n"),
  });
}
