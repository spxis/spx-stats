"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { setProbed } from "@/lib/auth/hint";

/**
 * Starts the sign-in. `next` has already been checked on the server; next-auth checks it again. Google is the way in on the site; the DS1
 * preview on this Mac also offers "Sign in (this Mac)" (`preview`, lib/auth/preview.ts), which the server shows only for a loopback request.
 */
export function SignInButton({ next, google = true, preview = false }: { next: string; google?: boolean; preview?: boolean }) {
  const [busy, setBusy] = useState<"google" | "preview" | null>(null);
  const start = (provider: "google" | "preview") => {
    setBusy(provider);
    setProbed(false);
    void signIn(provider, { callbackUrl: next });
  };
  return (
    <div className="signin-choices">
      {google ? (
        <button type="button" className="signin-btn" disabled={busy !== null} onClick={() => start("google")}>
          {busy === "google" ? "Opening Google…" : "Continue with Google"}
        </button>
      ) : null}
      {preview ? (
        <button type="button" className="signin-btn" disabled={busy !== null} onClick={() => start("preview")}>
          {busy === "preview" ? "Signing in…" : "Sign in (this Mac)"}
        </button>
      ) : null}
    </div>
  );
}
