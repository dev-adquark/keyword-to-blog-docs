import { NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/server/validation";
import { hashPassword } from "@/lib/server/password";
import {
  findOtpById,
  deleteOtp,
  updateUserPassword,
  revokeAllSessionsForUser,
} from "@/lib/server/repository";
import { verifyResetTicket } from "@/lib/server/otp";
import { consumeFixedWindowLimit } from "@/lib/server/rateLimit";
import { getClientIp } from "@/lib/server/clientIp";

export const runtime = "nodejs";

const EXPIRED_TICKET = {
  code: "VALIDATION_ERROR",
  message: "This reset link has expired. Please start again.",
};

export async function POST(req: Request) {
  const ip = getClientIp(req.headers);
  const ipLimit = await consumeFixedWindowLimit(`rl:reset-password:ip:${ip}`, 20, 60 * 60);
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { code: "RATE_LIMITED", message: "Too many attempts. Please try again later." },
      { status: 429 }
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = body ? resetPasswordSchema.safeParse(body) : null;
  if (!parsed || !parsed.success) {
    return NextResponse.json(
      {
        code: "VALIDATION_ERROR",
        message: parsed?.error.issues[0]?.message ?? "Please check your details and try again.",
      },
      { status: 400 }
    );
  }
  const { resetToken, newPassword } = parsed.data;

  const ticket = await verifyResetTicket(resetToken);
  if (!ticket) {
    return NextResponse.json(EXPIRED_TICKET, { status: 400 });
  }

  const otp = await findOtpById(ticket.otpId);
  const isValidTicket =
    otp &&
    otp.user_id === ticket.userId &&
    otp.purpose === "password_reset" &&
    otp.verified_at !== null;

  if (!isValidTicket) {
    // Already consumed, or forged/stale — either way, start over.
    return NextResponse.json(EXPIRED_TICKET, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);
  await updateUserPassword(ticket.userId, passwordHash);
  await deleteOtp(otp.id); // one-time use
  await revokeAllSessionsForUser(ticket.userId); // force a fresh login everywhere

  return NextResponse.json({ ok: true }, { status: 200 });
}
