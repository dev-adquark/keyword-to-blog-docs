import { describe, expect, it } from "vitest";

describe("public signup is removed", () => {
  it("GET /signup redirects to /login instead of rendering a registration form", async () => {
    const SignupPage = (await import("@/app/signup/page")).default;

    let redirectedTo: string | null = null;
    try {
      // next/navigation's redirect() throws a special control-flow error that
      // carries the destination — this is how Next itself detects a redirect
      // from a Server Component, so catching it here is the correct way to
      // assert the redirect without a full Next.js server.
      SignupPage();
    } catch (err) {
      redirectedTo = (err as { digest?: string }).digest ?? null;
    }

    expect(redirectedTo).not.toBeNull();
    expect(redirectedTo).toContain("/login");
  });

  it("does not export a POST handler for account self-registration", async () => {
    const removedRoutePath = "@/app/api/auth/signup/route";
    await expect(import(/* @vite-ignore */ removedRoutePath)).rejects.toBeDefined();
  });
});
