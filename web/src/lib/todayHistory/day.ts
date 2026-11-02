import "server-only";
import { calendarIcon } from "@johnmorrisdotca/koyomi-calendars/themes/line";
import baseball from "./data/baseball.json" with { type: "json" };
import basketball from "./data/basketball.json" with { type: "json" };
import football from "./data/football.json" with { type: "json" };
import hockey from "./data/hockey.json" with { type: "json" };
import { sportOfLeague, type HistoryDay, type HistoryFile } from "./types.ts";

const FILES: Record<string, HistoryFile> = { hockey, basketball, baseball, football } as unknown as Record<string, HistoryFile>;

/** The calendar page of a day, as Koyomi Calendars draws it (its `line` design alone, so no other design is loaded: ink strokes and one accent colour), without the year (so no weekday and no year chip, the same for every year)
 * and without a fixed size: the page's CSS sizes it and recolours it from the site's own tokens (app/globals.css, `.hist-cal`). The month is written in the reader's language. */
export function dayIcon(month: number, day: number, locale: string): string {
  return calendarIcon({ month, day, locale }).replace(/ width="\d+" height="\d+"/, "");
}

/** "MM-DD" of a day that exists in some year (02-29 does); null otherwise. */
export function parseDay(md: string): { month: number; day: number } | null {
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) return null;
  const month = Number(m[1]), day = Number(m[2]);
  return month >= 1 && month <= 12 && day >= 1 && day <= new Date(Date.UTC(2024, month, 0)).getUTCDate() ? { month, day } : null;
}

/** What a sport's block shows for a calendar day: the page and up to three facts (of every league of the sport), or null when the sport has nothing for that day. A league answers with its sport's facts. */
export function historyDay(league: string, md: string, locale: string): HistoryDay | null {
  const when = parseDay(md), sport = sportOfLeague(league);
  if (!when || !sport) return null;
  const facts = FILES[sport]?.days[md];
  return facts?.length ? { icon: dayIcon(when.month, when.day, locale), facts } : null;
}
