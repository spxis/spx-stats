"use client";

import { useEffect } from "react";
import { TAB_COOKIE, type Tab } from "@/lib/releases/rules";

/** Remembers the tab this viewer used last, so /admin/data opens on it next time. A cookie, because the server reads it before drawing; it holds one word. */
export function TabMemory({ tab }: { tab: Tab }) {
  useEffect(() => {
    try {
      document.cookie = `${TAB_COOKIE}=${tab}; path=/admin/data; max-age=31536000; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    } catch {
      // cookies blocked: the tab is still in the address
    }
  }, [tab]);
  return null;
}
