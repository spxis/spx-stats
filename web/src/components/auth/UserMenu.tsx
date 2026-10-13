"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { setHint } from "@/lib/auth/hint";
import { LanguagePicker } from "../i18n/LanguagePicker";
import { ThemeToggle } from "../ThemeToggle";

export type MenuUser = { name: string | null; email: string; image: string | null; admin: boolean };

/**
 * The way in, shown to signed-out visitors when sign-in is configured. Returns to the page it was clicked on. A kept page is drawn
 * once for everyone, so the page to return to is read from the browser when the link is used, not when it is drawn.
 */
export function SignInLink() {
  const router = useRouter();
  return (
    <Link
      className="signin-link"
      href="/login"
      onClick={(e) => {
        const path = location.pathname;
        if (path === "/login" || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        router.push(`/login?next=${encodeURIComponent(path)}`);
      }}
    >
      Sign in
    </Link>
  );
}

/** Top-right account menu: who you are, Profile, Settings, the admin section for admins, version, Sign out. */
export function UserMenu({ user, version }: { user: MenuUser; version: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const label = user.name || user.email;
  return (
    <div className="usermenu" ref={root}>
      <button type="button" className="usermenu-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- a Google avatar URL, not ours to optimise
          <img src={user.image} alt="" width={26} height={26} referrerPolicy="no-referrer" />
        ) : (
          <span className="usermenu-initial" aria-hidden="true">{label.slice(0, 1).toUpperCase()}</span>
        )}
        <span className="usermenu-name">{label}</span>
      </button>
      {open ? (
        <div className="usermenu-pop" role="menu" onClick={(e) => { if ((e.target as HTMLElement).closest("a")) setOpen(false); }}>
          <div className="usermenu-who">
            <b>{user.name || user.email}</b>
            {user.name ? <span>{user.email}</span> : null}
          </div>
          <Link role="menuitem" href="/me/profile">Profile</Link>
          <Link role="menuitem" href="/me/settings">Settings</Link>
          <div className="usermenu-lang"><LanguagePicker /></div>
          <div className="usermenu-lang"><ThemeToggle /></div>
          {user.admin ? (
            <div className="usermenu-sec">
              <b>Admin</b>
              <Link role="menuitem" href="/admin/tickets">Tickets</Link>
              <Link role="menuitem" href="/admin/tickets/new">File a ticket</Link>
              <Link role="menuitem" href="/admin/data">Data releases</Link>
              <Link role="menuitem" href="/admin/people">People to check</Link>
            </div>
          ) : null}
          <div className="usermenu-sec">
            <span className="note">Version {version}</span>
            {user.admin ? <Link role="menuitem" href="/admin/tickets?status=done">What is new</Link> : null}
          </div>
          <button type="button" role="menuitem" onClick={() => { setHint(false); void signOut({ callbackUrl: "/" }); }}>Sign out</button>
        </div>
      ) : null}
    </div>
  );
}
