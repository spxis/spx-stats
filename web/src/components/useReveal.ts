"use client";

import { useCallback, useMemo, useState } from "react";

/**
 * The rest of a table whose data is already in the page: the first `head` lines are drawn, the others when "Show all" is pressed or the table is
 * sorted another way (SortTable asks for them through `partial.load`). Nothing is fetched, so `state` is only idle or done. With `full` every line is drawn.
 */
export function useReveal<T>(lines: readonly T[], head: number, full: boolean) {
  const [open, setOpen] = useState(false);
  const load = useCallback(() => setOpen(true), []);
  const loaded = full || open || lines.length <= head;
  const shown = useMemo(() => (loaded ? lines : lines.slice(0, head)), [lines, head, loaded]);
  return { shown, loaded, state: (loaded ? "done" : "idle") as "idle" | "done", load };
}
