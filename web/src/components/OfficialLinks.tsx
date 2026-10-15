"use client";

import { useSyncExternalStore } from "react";
import { officialLinks, type OfficialKind } from "@/lib/officialLinks";

const subscribe = () => () => {};
const on = () => true;
const off = () => false;

/**
 * The league's own pages for this game. The server draws nothing: the addresses are built in the
 * browser from the date, the two abbreviations and, for the NHL, the numeric id.
 */
export function OfficialLinks({ league, date, away, home, nhlId, box, notes, day }: {
  league: string;
  date: string;
  away: string | null;
  home: string | null;
  nhlId?: number | null;
  box: string;
  notes: string;
  day: string;
}) {
  const ready = useSyncExternalStore(subscribe, on, off);
  if (!ready) return null;
  const links = officialLinks({ league, date, away, home, nhlId });
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
