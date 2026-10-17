"use client";

import { useEffect, useState } from "react";
import { GROW_KEY } from "@/lib/leagueFamilies";
import { useSpeaker } from "./i18n/LocaleProvider";

const EVENT = "spxn-archive-grow";

/**
 * Shared Grow/Collapse for the archive-holds chart (home and every family page).
 * localStorage only: a kept page must not read cookies or searchParams on the server.
 * The first paint is always condensed; a saved Grow applies after mount.
 */
export function useArchiveGrow() {
  const [grown, setState] = useState(false);
  useEffect(() => {
    const read = () => {
      try { setState(localStorage.getItem(GROW_KEY) === "1"); } catch { /* storage may be blocked */ }
    };
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);
  const setGrown = (next: boolean) => {
    setState(next);
    try { localStorage.setItem(GROW_KEY, next ? "1" : "0"); } catch { /* storage may be blocked */ }
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
