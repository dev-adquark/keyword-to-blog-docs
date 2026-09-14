"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function LogoutButton() {
  const router = useRouter();
  async function onClick() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Network failure — still clear the client and send the user to login;
      // the session cookie is short-lived and server-side auth is re-checked anyway.
    }
    router.push("/login");
    router.refresh();
  }
  return (
    <Button variant="ghost" size="sm" onClick={onClick}>
      Log out
    </Button>
  );
}
