import { atUtc, isoDay } from "./format";

/** The scoreboard of a league: /nhl/scores (the latest games) or /nhl/scores/2023-04-15. */
export const scoresPath = (lg: string, day?: string): string => (day ? `/${lg}/scores/${day}` : `/${lg}/scores`);

export function addDay(iso: string, n: number): string {
  const d = atUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** A day in an address segment: a real calendar day written 2023-04-15, or null. */
export function parseDay(seg: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seg)) return null;
  const d = atUtc(seg);
  return Number.isNaN(d.getTime()) || isoDay(d) !== seg || seg < "1800-01-01" ? null : seg;
}

/** Today by the server's clock (UTC). */
export const todayUtc = (): string => isoDay(new Date());
