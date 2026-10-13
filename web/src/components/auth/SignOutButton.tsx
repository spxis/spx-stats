"use client";

import { signOut } from "next-auth/react";
import { setHint } from "@/lib/auth/hint";

export function SignOutButton() {
  return (
    <button type="button" className="signin-btn" onClick={() => { setHint(false); void signOut({ callbackUrl: "/" }); }}>
      Sign out
    </button>
  );
}
