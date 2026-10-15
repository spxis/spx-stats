"use client";

import { useCallback, useMemo, useRef, useState } from "react";

export type MoreState = "idle" | "loading" | "failed" | "done";

/**
 * The rest of a long table, fetched when the reader asks for it. The page carries the first rows of the table as plain data (`head`); the others
 * are one small JSON answer ({ lines: [...] }) from a kept address of their own, so a page nobody scrolls down costs none of them, in its markup
 * or in its payload. `body` is the whole answer once it has come (a table whose lines point into a list the answer carries reads it there). `lines` is the head, then the rest once it has come; `load` asks for it (asking twice is one request; a failed ask can be repeated).
 */
export function useMoreLines<T, B extends { lines?: T[] } = { lines?: T[] }>(href: string, head: readonly T[]) {
  const [rest, setRest] = useState<readonly T[] | null>(null);
  const [body, setBody] = useState<B | null>(null);
  const [state, setState] = useState<MoreState>("idle");
  const asked = useRef(false);
  const load = useCallback(async () => {
    if (asked.current) return;
    asked.current = true;
    setState("loading");
    try {
      const res = await fetch(href, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(String(res.status));
      const got = (await res.json()) as B;
      if (!Array.isArray(got.lines)) throw new Error("no lines");
      setBody(got);
      setRest(got.lines);
      setState("done");
    } catch {
      asked.current = false;
      setState("failed");
    }
  }, [href]);
  const lines = useMemo(() => (rest ? [...head, ...rest] : head), [head, rest]);
  return { lines, state, load, body };
}
