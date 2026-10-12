"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

/** Starts the Google sign-in. `next` has already been checked on the server; next-auth checks it again. */
export function SignInButton({ next }: { next: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="signin-btn"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void signIn("google", { callbackUrl: next });
      }}
    >
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
