import { LOCALE_TAG, type Locale } from "./locale.ts";
import { localText } from "./localTime.ts";

/**
 * How to show a scheduled start beside a game's date. The time is an absolute instant. The clock is enough when that
 * instant falls on the game's date in the reader's zone. When it falls on another date there, a short date is shown
 * too (the weekday and the day), or a reader on the other side of midnight would think the game is on the day the
 * scoreboard named.
 */
export type StartStyle = "clock" | "stamp";

const dayIn = (iso: string, timeZone?: string): string | null => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    const options: Intl.DateTimeFormatOptions = { year: "numeric", month: "2-digit", day: "2-digit" };
    if (timeZone) options.timeZone = timeZone;
    return new Intl.DateTimeFormat("en-CA", options).format(new Date(t));
  } catch {
    return null;
  }
};

/**
 * "clock" when the instant is on gameDate in this zone, "stamp" when the calendar day differs.
 * With no zone, the runtime's zone is used (the reader's, in the browser). A value that is not a time is "clock".
 */
export function startStyle(iso: string | null | undefined, gameDate: string, timeZone?: string): StartStyle {
  if (!iso) return "clock";
  const day = dayIn(iso, timeZone);
  return day != null && day !== gameDate ? "stamp" : "clock";
}

const brief = (iso: string, locale: Locale, timeZone?: string): string | null => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const options: Intl.DateTimeFormatOptions = {
    weekday: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  };
  if (timeZone) options.timeZone = timeZone;
  try {
    return new Intl.DateTimeFormat(LOCALE_TAG[locale], options).format(new Date(t));
  } catch {
    return localText(iso, "stamp", locale, timeZone);
  }
};

/** The time of day when the instant falls on gameDate in this zone; otherwise a short date and the time ("Fri 16, 11:00 a.m."). */
export function startLabel(iso: string | null | undefined, gameDate: string, locale: Locale, timeZone?: string): string | null {
  if (!iso || startStyle(iso, gameDate, timeZone) === "clock") return localText(iso, "clock", locale, timeZone);
  return brief(iso, locale, timeZone);
}
