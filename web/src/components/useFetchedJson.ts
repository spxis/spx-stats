"use client";

import { useEffect, useState } from "react";

/**
 * One kept JSON answer, fetched once `when` turns true (a part of a page that is fetched when the reader gets near it). `state` is "idle" until then,
 * "loading" while it comes, "done" with `data` (the answer's `field`), "empty" when the route answers 404 (it has nothing to show for this one) or "failed". The answer must hold `field`, else it counts as failed.
 */
export function useFetchedJson<T>(href: string, field: string, when: boolean): { state: "idle" | "loading" | "done" | "empty" | "failed"; data: T | null } {
  const [res, setRes] = useState<{ href: string; data: T | null; empty?: boolean } | null>(null);
  useEffect(() => {
    if (!when) return;
    let live = true;
    fetch(href, { headers: { accept: "application/json" } })
      .then((r) => { if (r.status === 404) { if (live) setRes({ href, data: null, empty: true }); return null; } if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<Record<string, T | null | undefined>>; })
      .then((body) => { if (!body) return; const data = body[field]; if (data == null) throw new Error("no " + field); if (live) setRes({ href, data }); })
      .catch(() => { if (live) setRes({ href, data: null }); });
    return () => { live = false; };
  }, [href, field, when]);
  const mine = res?.href === href ? res : null;
  return { state: mine ? (mine.data ? "done" : mine.empty ? "empty" : "failed") : when ? "loading" : "idle", data: mine?.data ?? null };
}
