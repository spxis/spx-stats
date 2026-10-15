"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps /admin/ops current without a fast timer: one soft refresh of the page a minute while the tab is visible and its reader has done
 * something in the last 10 minutes; nothing while it is hidden or idle; and one refresh as soon as the reader comes back (the tab shown or
 * the window focused again) when the page is a minute old. Each refresh is one server render and one small read of production.
 */
export function OpsRefresh({ everySecs = 60, idleSecs = 600 }: { everySecs?: number; idleSecs?: number }) {
  const router = useRouter();
  useEffect(() => {
    let lastRefresh = Date.now();
    let lastActive = Date.now();
    const visible = () => document.visibilityState === "visible";
    const refresh = () => {
      lastRefresh = Date.now();
      router.refresh();
    };
    const touch = () => {
      lastActive = Date.now();
    };
    const wake = () => {
      if (!visible()) return;
      const idle = Date.now() - lastActive > idleSecs * 1000;
      touch();
      if (Date.now() - lastRefresh >= everySecs * 1000 || idle) refresh();
    };
    // a cheap local check every 10 seconds; the refresh itself is never sooner than everySecs after the last one
    const timer = setInterval(() => {
      if (!visible() || Date.now() - lastActive > idleSecs * 1000) return;
      if (Date.now() - lastRefresh >= everySecs * 1000) refresh();
    }, 10_000);
    const events = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true });
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    return () => {
      clearInterval(timer);
      for (const e of events) window.removeEventListener(e, touch);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
    };
  }, [router, everySecs, idleSecs]);
  return null;
}
