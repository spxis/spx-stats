"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { resolveAt, type AtList, type AtRow } from "@/lib/allTimeLines";
import type { MoreState } from "./useMoreLines";

/** One request per address for the whole page: the table, every list of bars and the charts all want the same answer. A failed ask can be repeated. */
const asked = new Map<string, Promise<AtList>>();
function fetchAll(href: string): Promise<AtList> {
  let p = asked.get(href);
  if (!p) {
    p = fetch(href, { headers: { accept: "application/json" } })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json() as Promise<Partial<AtList>>; })
      .then((got) => { if (!Array.isArray(got.lines) || !Array.isArray(got.logos)) throw new Error("no lines"); return got as AtList; });
    asked.set(href, p);
    p.catch(() => { if (asked.get(href) === p) asked.delete(href); });
  }
  return p;
}

/**
 * Every franchise of a league's all-time table, fetched when `load` is called (the page carries only the few its first screen shows, as `head`).
 * `rows` is the head, then the rest once it has come (a franchise the head holds is not listed twice), in the order of the league's whole list.
 */
export function useAllTime(href: string, head: AtList | null) {
  const [all, setAll] = useState<AtList | null>(null);
  const [state, setState] = useState<MoreState>("idle");
  const busy = useRef(false);
  const load = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    fetchAll(href).then((list) => { setAll(list); setState("done"); }, () => { busy.current = false; setState("failed"); });
  }, [href]);
  const rows = useMemo<AtRow[]>(() => {
    const first = head ? resolveAt(head) : [];
    if (!all) return first;
    const have = new Set(first.map((t) => t.f));
    return [...first, ...resolveAt(all).filter((t) => !have.has(t.f))].sort((a, b) => a.o - b.o);
  }, [head, all]);
  return { rows, state, load };
}
