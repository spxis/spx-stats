"use client";

import { useEffect, useRef } from "react";
import type { TurnLeague } from "@/lib/trophyTurn";

/**
 * Makes the trophy drawn just before it turn: put it right after the element the server drew (TrophyBanner does). It draws nothing itself, so the
 * page looks right with no script and for crawlers. Once that element scrolls into view it loads the one trophy's frames and the turning code
 * (lib/turnCup.ts: the package's light bindTurn and the one cup), and from then on the trophy turns slowly, can be dragged and answers the arrow keys. `hint` says so to a screen reader.
 */
export function TurnTrophy({ league, hint }: { league: TurnLeague; hint: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const target = marker.current?.previousElementSibling;
    if (!(target instanceof HTMLElement)) return;
    let stop: (() => void) | undefined;
    let gone = false;
    const watcher = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      watcher.disconnect();
      import("@/lib/turnCup").then((m) => m.turnCup(target, league, hint)).then((s) => { if (gone) s(); else stop = s; }, () => {});
    });
    watcher.observe(target);
    return () => { gone = true; watcher.disconnect(); stop?.(); };
  }, [league, hint]);
  return <span ref={marker} hidden />;
}
