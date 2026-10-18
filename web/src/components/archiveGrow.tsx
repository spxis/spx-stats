"use client";

import { useEffect, useState } from "react";
import { GROW_KEY } from "@/lib/leagueFamilies";
import { useSpeaker } from "./i18n/LocaleProvider";

const EVENT = "spxn-archive-grow";

/**
 * Shared Grow/Collapse for the archive-holds chart (home and every family page).
 * Browser storage only: a kept page must not read cookies or searchParams on the server.
 * The condensed family rows ("NHL+") are the default for every visit. Grow is remembered for this tab's
 * session only (sessionStorage), so the next visit opens condensed again; an older saved Grow in
 * localStorage (the first version kept it for good) is dropped and never read.
 */
export function useArchiveGrow() {
  const [grown, setState] = useState(false);
  useEffect(() => {
    try { localStorage.removeItem(GROW_KEY); } catch { /* storage may be blocked */ }
    const read = () => {
      try { setState(sessionStorage.getItem(GROW_KEY) === "1"); } catch { /* storage may be blocked */ }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const setGrown = (next: boolean) => {
    setState(next);
    try { sessionStorage.setItem(GROW_KEY, next ? "1" : "0"); } catch { /* storage may be blocked */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return { grown, setGrown };
}

/** The Grow / Collapse control. Hidden when the chart has no family to split. */
export function GrowToggle({ canGrow }: { canGrow: boolean }) {
  const { grown, setGrown } = useArchiveGrow();
  const { say } = useSpeaker();
  if (!canGrow) return null;
  return (
    <button type="button" className="yr-preset" aria-pressed={grown}
      aria-label={grown ? say("archive.collapseAria") : say("archive.growAria")}
      onClick={() => setGrown(!grown)}>
      {grown ? say("archive.collapse") : say("archive.grow")}
    </button>
  );
}
