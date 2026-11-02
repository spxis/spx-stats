import "server-only";
import { calendarIcon } from "@johnmorrisdotca/meigen-sports";
import cfl from "./data/cfl.json" with { type: "json" };
import mlb from "./data/mlb.json" with { type: "json" };
import nba from "./data/nba.json" with { type: "json" };
import nfl from "./data/nfl.json" with { type: "json" };
import nhl from "./data/nhl.json" with { type: "json" };
import { hasHistory, type HistoryFact, type HistoryFile } from "./types.ts";

const FILES: Record<string, HistoryFile> = { nhl, nba, mlb, nfl, cfl } as unknown as Record<string, HistoryFile>;

/** The calendar page of a day, as the package draws it (theme `line`: ink strokes and one accent colour), without the year (so no weekday and no year chip, the same for every year)
 * and without a fixed size: the page's CSS sizes it and recolours it from the site's own tokens (app/globals.css, `.hist-cal`). The month is written in the reader's language. */
export function dayIcon(month: number, day: number, locale: string): string {
  return calendarIcon({ theme: "line", month, day, locale }).replace(/ width="\d+" height="\d+"/, "");
}

/** "MM-DD" of a day that exists in some year (02-29 does); null otherwise. */
export function parseDay(md: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(2024, month, 0)).getUTCDate() ? { month, day } : null;
}

/** What a league's block shows for a calendar day: the page and up to three facts, or null when the league has nothing for that day (or is not one with a block). */
export function historyDay(league: string, md: string, locale: string): { icon: string; facts: HistoryFact[] } | null {
  const when = parseDay(md);
  if (!when || !hasHistory(league)) return null;
  const facts = FILES[league].days[md];
  return facts?.length ? { icon: dayIcon(when.month, when.day, locale), facts } : null;
}
