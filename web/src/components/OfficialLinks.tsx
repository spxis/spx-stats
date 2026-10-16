"use client";

import { useRef, useSyncExternalStore } from "react";
import { officialLinks, type OfficialKind } from "@/lib/officialLinks";

const subscribe = () => () => {};

/**
 * The viewer's clock, captured once when this component is shown. The server snapshot is empty, so
 * a kept page (drawn once a day) never contains the addresses. The browser reads the clock then.
 */
function useViewNow(): number | null {
  const stamp = useRef<number | null>(null);
  return useSyncExternalStore(
    subscribe,
    () => {
      if (stamp.current == null) stamp.current = Date.now();
      return stamp.current;
    },
    () => null,
  );
}

/**
 * The league's own pages for this game, and Retrosheet's box score for MLB. The server draws
 * nothing: the addresses are built in the browser from the date, the two clubs and, where the row
 * has one, the NHL id, the NFL week or the Retrosheet home code. Game notes wait until the game
 * has started.
 */
export function OfficialLinks({ league, date, away, home, awayName, homeName, year, phase, nhlId, nflWeek, retroBox, status, startsAt, box, notes, day }: {
  league: string;
  date: string;
  away: string | null;
  home: string | null;
  awayName?: string | null;
  homeName?: string | null;
  year?: number | null;
  phase?: string | null;
  nhlId?: number | null;
  nflWeek?: number | null;
  retroBox?: string | null;
  status?: string | null;
  startsAt?: string | null;
  box: string;
  notes: string;
  day: string;
}) {
  const now = useViewNow();
  if (now == null) return null;
  const links = officialLinks({ league, date, away, home, awayName, homeName, year, phase, nhlId, nflWeek, retroBox, status, startsAt, now });
  if (!links.length) return null;
  const label: Record<OfficialKind, string> = { box, notes, day };
  return (
    <span className="olinks">
      {links.map((l) => (
        <a key={l.kind} href={l.href} target="_blank" rel="noopener noreferrer">{label[l.kind]}</a>
      ))}
    </span>
  );
}
