"use client";

import { useSyncExternalStore } from "react";
import { safeDestination } from "@/lib/auth/redirect";
import { SignInButton } from "./SignInButton";

const never = () => () => {};
const address = () => `${location.pathname}${location.search}`;

/**
 * The sign-in button of the kept invite page (app/[locale]/s/closed). The page is drawn once for everyone, so where to go after sign-in is read
 * here, in the browser: the address in the bar, which the gate's rewrite left as the page the reader asked for.
 */
export function ClosedSignIn() {
  const next = useSyncExternalStore(never, address, () => "/");
  return <SignInButton next={safeDestination(next)} />;
}
