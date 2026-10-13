/**
 * What a player page keeps in its address, read in the browser so the page itself stays one static copy: `?from=&to=` (the seasons shown),
 * `?phase=p` (playoffs) and `?teams=league:franchise,...` (clubs). Pure; the board's store (components/PlayerBoard.tsx) reads and writes them.
 * The old `?season=1988` link means that one season.
 */
import type { Phase, Span } from "./playerBoard.ts";
import { clampSpan } from "./playerBoard.ts";

export interface PlayerState { span: Span; phase: Phase; clubs: ReadonlySet<string> }

/** Where a page's range is remembered between visits: one key per player page, so each player keeps their own. */
export const playerRangeKey = (pathname: string): string => `spxn-range-p:${pathname}`;

const year = (v: string | null): number | null => (v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null);

/** The range the address names as "from-to" text ("from-" or "-to" when one end is missing), or "" for none. */
export function rawPlayerSpan(search: string): string {
  const q = new URLSearchParams(search);
  const f = year(q.get("from")), t = year(q.get("to"));
  return f != null || t != null ? `${f ?? ""}-${t ?? ""}` : "";
}

/** The state an address asks for, inside the seasons min..max and the clubs the player has (`valid`, "league:franchise" keys). */
export function parsePlayerState(search: string, min: number, max: number, valid: readonly string[]): PlayerState {
  const q = new URLSearchParams(search);
  const f = year(q.get("from")), t = year(q.get("to")), s = year(q.get("season"));
  const span = f != null || t != null ? clampSpan({ from: f ?? undefined, to: t ?? undefined }, min, max)
    : s != null && s >= min && s <= max ? { from: s, to: s } : { from: min, to: max };
  const picked = new Set((q.get("teams") ?? "").split(",").filter((k) => valid.includes(k)));
  return { span, phase: q.get("phase") === "p" ? "playoffs" : "regular", clubs: picked.size > 0 && picked.size < valid.length ? picked : new Set() };
}

/** The query text for a state: only what differs from the plain page, so the plain page keeps a plain address. */
export function playerStateText(state: PlayerState, min: number, max: number): string {
  const q = new URLSearchParams();
  if (state.span.from > min || state.span.to < max) { q.set("from", String(state.span.from)); q.set("to", String(state.span.to)); }
  if (state.phase === "playoffs") q.set("phase", "p");
  if (state.clubs.size) q.set("teams", [...state.clubs].join(","));
  const s = q.toString();
  return s ? `?${s}` : "";
}
