"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { hasHint, setHint, setProbed, wasProbed } from "@/lib/auth/hint";
import { LanguagePicker } from "../i18n/LanguagePicker";
import { ThemeToggle } from "../ThemeToggle";
import { SignInLink, UserMenu, type MenuUser } from "./UserMenu";

/** What /api/me answers: the signed-in reader and, for an admin, the line the admin bar shows and how many things wait for them. */
export interface Account { user: MenuUser | null; bar: string | null; waiting?: number }

const NOBODY: Account = { user: null, bar: null };
const AccountContext = createContext<Account>(NOBODY);

/**
 * The signed-in reader, learned in the browser so the page around it can be kept. A kept page always draws the signed-out header
 * and footer; for a browser that carries the hint cookie (lib/auth/hint.ts) the script in <head> hides those at once, and this
 * fetches /api/me and swaps in the account menu. The signed-in pages (/me, /admin, /login) are drawn per request and pass
 * `initial`, so they ask nothing.
 */
export function AccountProvider({ enabled, initial, children }: { enabled: boolean; initial?: Account; children: ReactNode }) {
  const [account, setAccount] = useState<Account>(initial ?? NOBODY);

  // A page drawn per request passes what the server knows. When the page is drawn again (an approval on /admin/data re-draws it, after
  // expiring the admin summary) that answer replaces the old one: state taken from a prop once kept showing the first draw's banner.
  const initialKey = initial ? JSON.stringify(initial) : "";
  const [seen, setSeen] = useState(initialKey);
  if (initialKey !== seen) {
    setSeen(initialKey);
    if (initial) setAccount(initial);
  }

  useEffect(() => {
    if (!enabled) return;
    if (initial) {
      setHint(initial.user !== null);
      return;
    }
    if (!hasHint() && wasProbed()) return;
    let live = true;
    fetch("/api/me", { cache: "no-store", credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<Account>) : NOBODY))
      .then((found) => {
        if (!live) return;
        setProbed(true);
        setHint(found.user !== null);
        setAccount(found.user ? found : NOBODY);
      })
      .catch(() => { /* offline or refused: the signed-out header stays */ });
    return () => { live = false; };
  }, [enabled, initial]);

  return <AccountContext.Provider value={account}>{children}</AccountContext.Provider>;
}

export const useAccount = (): Account => useContext(AccountContext);

/** Top right of the header: the account menu for a signed-in reader, else the theme switch and the way in. */
export function HeaderAccount({ version, signIn }: { version: string; signIn: boolean }) {
  const { user, waiting } = useAccount();
  if (user) return <UserMenu user={user} version={version} waiting={waiting ?? 0} />;
  return (
    <>
      <span className="anon"><ThemeToggle /></span>
      {signIn ? <span className="anon"><SignInLink /></span> : null}
    </>
  );
}

/** The language choice at the foot of the page; a signed-in reader finds it in the account menu instead. */
export function FooterLanguage() {
  const { user } = useAccount();
  return user ? <span /> : <span className="anon"><LanguagePicker /></span>;
}

/** A slim notice above the header for signed-in admins when a release waits, a drift fix is proposed or auto-approval is on Hold. */
export function AdminBar(): ReactNode {
  const { bar } = useAccount();
  if (!bar) return null;
  return (
    <div className="adminbar" role="status">
      <Link href="/admin/data">{bar}</Link>
    </div>
  );
}
