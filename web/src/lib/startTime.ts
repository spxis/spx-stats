/**
 * How to show a scheduled start beside a game's date. The time is an absolute instant (UTC). The clock is enough when that
 * instant falls on the game's date in the reader's zone. When it falls on another date, the date has to be shown too, or a
 * reader on the other side of midnight would think the game is on the day the scoreboard named.
 */
export type StartStyle = "clock" | "stamp";

const dayIn = (iso: string, timeZone: string): string | null => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
  } catch {
    return null;
  }
};

/** "clock" when the instant is on gameDate in this zone, "stamp" when the calendar day differs. A value that is not a time is "clock". */
export function startStyle(iso: string | null | undefined, gameDate: string, timeZone = "UTC"): StartStyle {
  if (!iso) return "clock";
  const day = dayIn(iso, timeZone);
  return day != null && day !== gameDate ? "stamp" : "clock";
}
